"""Exercise the migrated legal-consent RPC with two real PostgreSQL sessions.

Requires psql, the latest migrations, and an explicitly disposable local database.
Creates a synthetic customer and reviewed test-fixture documents, enables consent
for the test, then restores the previous setting and withdraws the fixture docs.
Immutable fixture history remains: reset the disposable database after testing.

Required environment: SALLAH_DISPOSABLE_DB_CONFIRMED=1, PGHOST (loopback), PGPORT,
PGDATABASE, PGUSER, and normal libpq authentication such as PGPASSWORD/PGPASSFILE.
Optional: PSQL_BIN. No credential is placed in command arguments or printed.
"""

import json
import os
import re
import subprocess
import sys
import time
import uuid


def validate_target():
    loopback = {"127.0.0.1", "localhost", "::1"}
    if os.environ.get("SALLAH_DISPOSABLE_DB_CONFIRMED") != "1":
        raise ValueError("explicitly designate a disposable local database")
    if os.environ.get("PGHOST") not in loopback:
        raise ValueError("PGHOST must be an explicit loopback address")
    if os.environ.get("PGHOSTADDR") not in {None, "", "127.0.0.1", "::1"}:
        raise ValueError("PGHOSTADDR cannot override the loopback target")
    if os.environ.get("PGSERVICE"):
        raise ValueError("PGSERVICE is not supported by this disposable database test")
    if not re.fullmatch(r"[A-Za-z0-9_]+", os.environ.get("PGDATABASE", "")):
        raise ValueError("PGDATABASE must be an explicit database name, not a connection string")
    port = os.environ.get("PGPORT", "")
    if not port.isdigit() or not 1 <= int(port) <= 65535:
        raise ValueError("PGPORT must be an explicit valid local port")
    if not os.environ.get("PGUSER"):
        raise ValueError("PGUSER must be explicit")


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def main():
    try:
        validate_target()
    except ValueError as error:
        print(f"NOT RUN: {error}", file=sys.stderr)
        return 2

    command = [os.environ.get("PSQL_BIN", "psql"), "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"]

    def query(sql):
        result = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=15)
        if result.returncode:
            raise RuntimeError("Disposable fixture query failed: " + result.stderr.strip())
        return result.stdout.strip()

    def wait_for_session(name, predicate, process, description):
        deadline = time.monotonic() + 15
        while time.monotonic() < deadline:
            observed = query(
                "select exists(select 1 from pg_stat_activity "
                f"where application_name={literal(name)} and ({predicate}));"
            )
            if observed == "t":
                return
            if process.poll() is not None:
                raise RuntimeError(f"{description}: session exited before the handshake")
            time.sleep(0.1)
        raise RuntimeError(f"{description}: handshake timed out after 15 seconds")

    suffix = uuid.uuid4().hex
    actor = str(uuid.uuid4())
    version = f"test-race-v1-{suffix}"
    replacement_version = f"test-race-v2-{suffix}"
    approval_reference = f"test-fixture-only:publication-race:{suffix}"
    publisher_name = f"sallah_legal_pub_{suffix}"
    acceptor_name = f"sallah_legal_accept_{suffix}"
    publisher = None
    acceptor = None
    setup_attempted = False
    previous_setting = None
    result_code = 1

    try:
        previous_setting = json.loads(query(
            "select coalesce((select jsonb_build_object('value',value) "
            "from public.system_settings where key='legal.consent'),'null'::jsonb);"
        ))
        setup_attempted = True
        query(
            "begin; "
            "insert into auth.users(id,instance_id,aud,role,email,encrypted_password,"
            "email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) "
            f"values('{actor}','00000000-0000-0000-0000-000000000000',"
            f"'authenticated','authenticated','legal-race-{suffix}@test.invalid',"
            "extensions.crypt(gen_random_uuid()::text,extensions.gen_salt('bf')),"
            "clock_timestamp(),'{}','{}',clock_timestamp(),clock_timestamp()); "
            "with stamp as materialized (select clock_timestamp()-interval '1 second' as observed) "
            "insert into public.legal_documents(document_type,version,locale,content_hash,"
            "published_at,effective_at,requires_acceptance,title,body,approved_at,approval_reference) "
            f"select kind,{literal(version)},'ar',"
            "encode(extensions.digest('Synthetic disposable policy fixture: '||kind,'sha256'),'hex'),"
            "stamp.observed,stamp.observed,true,'Synthetic fixture '||kind,"
            "'Synthetic disposable policy fixture: '||kind,stamp.observed,"
            f"{literal(approval_reference)} from unnest(array['privacy','terms','community']) kind "
            "cross join stamp; "
            "insert into public.system_settings(key,value) "
            "values('legal.consent','{\"enabled\":true,\"scope\":\"disposable-race-test-only\"}') "
            "on conflict(key) do update set value=excluded.value; commit;"
        )
        context = json.loads(query("select public.get_legal_consent_context('ar');"))
        if (
            context["status"] != "required"
            or len(context["documents"]) != 3
            or any(document["version"] != version for document in context["documents"])
        ):
            raise RuntimeError("Synthetic documents are not the current set; use a fresh disposable database")
        documents = [
            {"id": str(uuid.UUID(document["id"])), "contentHash": document["contentHash"]}
            for document in context["documents"]
        ]
        for document in documents:
            if not re.fullmatch(r"[a-f0-9]{64}", document["contentHash"]):
                raise RuntimeError("Synthetic document hash is invalid")

        publisher = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        publisher.stdin.write(
            f"set application_name={literal(publisher_name)}; begin; "
            "select pg_advisory_xact_lock(hashtextextended('sallah:legal:publication',0)); "
            "\\echo PUBLISHER_LOCKED\n"
        )
        publisher.stdin.flush()
        wait_for_session(publisher_name, "state='idle in transaction'", publisher, "Publisher lock")

        acceptor = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        claims = json.dumps({"sub": actor, "role": "authenticated"})
        acceptor.stdin.write(
            f"set application_name={literal(acceptor_name)}; begin; "
            f"select set_config('request.jwt.claims',{literal(claims)},true); "
            "set local role authenticated; "
            "select public.accept_current_legal_documents('ar',"
            f"{literal(json.dumps(documents))}::jsonb,'test-race-{suffix}'); commit;\n"
        )
        acceptor.stdin.flush()
        wait_for_session(acceptor_name, "wait_event='advisory'", acceptor, "Acceptor publication wait")

        ids = ",".join(literal(document["id"]) + "::uuid" for document in documents)
        publisher.stdin.write(
            "with stamp as materialized (select clock_timestamp() as observed) "
            "insert into public.legal_documents(document_type,version,locale,content_hash,published_at,"
            "effective_at,requires_acceptance,title,body,approved_at,approval_reference) "
            f"select d.document_type,{literal(replacement_version)},d.locale,d.content_hash,"
            "stamp.observed,stamp.observed,true,d.title,d.body,stamp.observed,"
            f"{literal(approval_reference)} from public.legal_documents d cross join stamp "
            f"where d.id in ({ids}); commit;\n"
        )
        _, publisher_error = publisher.communicate(timeout=15)
        if publisher.returncode:
            raise RuntimeError("Synthetic publisher failed: " + publisher_error.strip())
        _, acceptor_error = acceptor.communicate(timeout=15)
        if acceptor.returncode == 0:
            raise RuntimeError("Stale documents were accepted after a newer publication committed")
        if "LEGAL_DOCUMENTS_CHANGED" not in acceptor_error:
            raise RuntimeError("Acceptor failed for an unexpected reason: " + acceptor_error.strip())
        if query(f"select count(*) from public.legal_acceptances where user_id='{actor}';") != "0":
            raise RuntimeError("Stale acceptance rows escaped the failed transaction")
        result_code = 0
    except (OSError, RuntimeError, subprocess.SubprocessError, ValueError, KeyError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
    finally:
        for process in (publisher, acceptor):
            if process is not None and process.poll() is None:
                try:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)
                except (OSError, subprocess.SubprocessError) as error:
                    print(f"FAIL: could not stop disposable fixture session: {error}", file=sys.stderr)
                    result_code = 1
        if setup_attempted:
            try:
                restore = (
                    "delete from public.system_settings where key='legal.consent';"
                    if previous_setting is None
                    else "insert into public.system_settings(key,value) values('legal.consent',"
                    + literal(json.dumps(previous_setting["value"]))
                    + "::jsonb) on conflict(key) do update set value=excluded.value;"
                )
                query(
                    "begin; " + restore
                    + "update public.legal_documents set withdrawn_at=clock_timestamp() "
                    + f"where approval_reference={literal(approval_reference)} and withdrawn_at is null; commit;"
                )
            except (OSError, RuntimeError, subprocess.SubprocessError) as error:
                print(f"FAIL: could not restore disposable fixture state: {error}", file=sys.stderr)
                result_code = 1
    if result_code == 0:
        print("PASS: actual RPC rejected stale documents after a verified publication-lock wait; setting restored")
    return result_code


if __name__ == "__main__":
    raise SystemExit(main())

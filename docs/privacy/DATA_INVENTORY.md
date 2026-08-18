# Data inventory

| Class                | Examples                                                | Location                   | Sensitivity                    |
| -------------------- | ------------------------------------------------------- | -------------------------- | ------------------------------ |
| Identity/contact     | auth ID, name, email/phone, locale                      | Auth/profiles              | confidential                   |
| Precise location     | address, point, access notes                            | addresses/jobs             | highly confidential            |
| Approximate location | rounded request point, city/district                    | service requests           | confidential                   |
| Provider evidence    | identity/license/registration images                    | private storage + metadata | highly confidential            |
| Service content      | text, answers, photos, voice/transcript                 | DB/private storage         | potentially sensitive          |
| Marketplace          | matches, sealed offers, job/change orders               | DB                         | confidential/commercial        |
| Communications       | messages, support, moderation                           | DB/private storage         | confidential                   |
| AI metadata          | original input, structured result, model/usage/fallback | DB                         | potentially sensitive          |
| Financial            | amounts, provider-neutral refs, holds/events            | DB                         | confidential; no raw card data |
| Security/ops         | device hash, push token ciphertext, audit/log metadata  | DB/logs                    | confidential                   |

Purpose, access, retention, deletion/anonymization, subprocessors, and cross-border handling require final legal approval. Data minimization and RLS apply independently of policy text.

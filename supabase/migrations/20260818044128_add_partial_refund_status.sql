-- PostgreSQL enum additions must commit before later migrations can use them.
alter type public.financial_status
  add value if not exists 'partially_refunded' after 'captured';

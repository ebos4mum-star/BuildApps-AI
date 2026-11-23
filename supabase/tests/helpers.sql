\set ON_ERROR_STOP on
\o /dev/null
-- helpers
create function pg_temp.act_as(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u::text, false);
  execute 'set role authenticated';
end $$;
create function pg_temp.expect_fail(sql text, label text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    return; -- denied, as intended
  end;
  raise exception 'EXPECTED FAILURE BUT SUCCEEDED: %', label;
end $$;
create function pg_temp.expect_rows(sql text, n int, label text) returns void language plpgsql as $$
declare c int;
begin
  execute 'select count(*) from (' || sql || ') q' into c;
  if c <> n then raise exception 'ROW COUNT MISMATCH for %: expected %, got %', label, n, c; end if;
end $$;

-- For statements RLS may silently filter: pass only if it raises OR modifies zero rows.
create function pg_temp.expect_no_effect(sql text, label text) returns void language plpgsql as $$
declare n int;
begin
  begin
    execute sql;
    get diagnostics n = row_count;
  exception when others then
    return;
  end;
  if n <> 0 then raise exception 'EXPECTED NO EFFECT BUT % ROW(S) CHANGED: %', n, label; end if;
end $$;

do $migration$
declare
  definition text := pg_get_functiondef('public.validate_collection_launch()'::regprocedure);
  marker constant text := 'new.row_count:=jsonb_array_length(new.rows_json);';
begin
  if length(definition)-length(replace(definition, marker, '')) <> length(marker) then
    raise exception 'Expected one collection row-count assignment';
  end if;
  execute replace(definition, marker, marker || E'\n if tg_relid = ''public.practice_collections''::regclass then return new; end if;');
end
$migration$;

do $migration$
declare definition text; updated text;
begin
 select pg_get_functiondef('public.validate_collection_launch()'::regprocedure) into definition;
 updated := replace(definition, $fields$'industry_name','industry_code','form_type'$fields$, $fields$'industry_name','form_type'$fields$);
 if updated=definition then raise exception 'Expected industry code validation was not found'; end if;
 execute updated;
end
$migration$;
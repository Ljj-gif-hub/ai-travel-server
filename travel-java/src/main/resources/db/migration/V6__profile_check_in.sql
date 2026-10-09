-- For deployments using manual schema migrations (JPA_DDL_AUTO=validate/none).
-- The default Hibernate ddl-auto=update adds this nullable column automatically.
ALTER TABLE users ADD COLUMN last_check_in_date DATE;

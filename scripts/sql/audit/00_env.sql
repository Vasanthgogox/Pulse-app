-- Session + cluster identity (compare across environments).
SELECT current_database()   AS database,
       current_user         AS db_user,
       session_user         AS session_user,
       inet_server_addr()   AS server_addr,
       inet_server_port()   AS server_port,
       version()            AS server_version,
       now()                AS captured_at;

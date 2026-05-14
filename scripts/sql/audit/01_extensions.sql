-- Installed extensions (capability / behavior differs by env).
SELECT extname,
       extversion,
       extrelocatable
FROM pg_extension
ORDER BY extname;

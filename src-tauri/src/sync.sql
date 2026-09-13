CREATE TABLE sync_state (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL);
CREATE TABLE sync_commits (payload TEXT NOT NULL);
CREATE TRIGGER apply_sync_commit AFTER INSERT ON sync_commits BEGIN
 DELETE FROM books WHERE id IN (SELECT value FROM json_each(NEW.payload,'$.deleted'));
 INSERT INTO books (id,metadata,file)
 SELECT json_extract(j.value,'$.book.id'),json_extract(j.value,'$.book'),
 CASE json_extract(j.value,'$.fileMode') WHEN 'set' THEN json_extract(j.value,'$.file') WHEN 'remove' THEN NULL ELSE (SELECT file FROM books WHERE id=json_extract(j.value,'$.book.id')) END
 FROM json_each(NEW.payload,'$.writes') AS j WHERE true
 ON CONFLICT(id) DO UPDATE SET metadata=excluded.metadata,file=excluded.file;
 INSERT INTO sync_state VALUES (1,json_extract(NEW.payload,'$.sync')) ON CONFLICT(id) DO UPDATE SET value=excluded.value;
 DELETE FROM sync_commits WHERE rowid=NEW.rowid;
END;

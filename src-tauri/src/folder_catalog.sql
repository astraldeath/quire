CREATE TABLE folder_catalog_storage (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
CREATE TRIGGER folder_catalog_commit BEFORE INSERT ON sync_commits
WHEN json_type(NEW.payload, '$.folders') = 'object'
BEGIN
  DELETE FROM folder_catalog_storage;
  INSERT INTO folder_catalog_storage(key, value)
    SELECT key, value FROM json_each(NEW.payload, '$.folders.states');
  INSERT INTO folder_catalog_storage(key, value)
    VALUES ('selected', json_extract(NEW.payload, '$.folders.selected'));
END;

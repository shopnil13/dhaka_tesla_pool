-- Runs once, when the Postgres volume is first created.
-- Integration tests use a separate database so they can truncate freely
-- without touching the development data.
CREATE DATABASE teslapool_test;

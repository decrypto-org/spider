-- Database: "DARKNET_DATA_DUMP"

-- DROP DATABASE "DARKNET_DATA_DUMP";

CREATE DATABASE "DARKNET_DATA_DUMP"
  WITH OWNER = postgres
       ENCODING = 'UTF8'
       TABLESPACE = pg_default
       LC_COLLATE = 'en_US.utf8'
       LC_CTYPE = 'en_US.utf8'
       CONNECTION LIMIT = -1;

CREATE TABLE BaseURL(
	BaseUrlID int NOT NULL,
	BaseUrl text NOT NULL,
	PRIMARY KEY (BaseUrlID)
)

CREATE TABLE Paths(
	PathID int NOT NULL,
	LastScrapedTimestamp BIGINT,
	LastSuccessfulTimestamp BIGINT,
	ContainsData boolean,
	Path text NOT NULL,
	BaseUrlID int NOT NULL,
	PRIMARY KEY (PathID),
	CONSTRAINT FK_BaseUrl FOREIGN KEY (BaseUrlID)
	REFERENCES BaseURL(BaseUrlID)
	ON DELETE CASCADE
	ON UPDATE CASCADE
)

CREATE TABLE Content(
	ContentID int NOT NULL,
	ScrapeTimestamp BIGINT,
	Content TEXT,
	PathID int NOT NULL,
	PRIMARY KEY (ContentID),
	CONSTRAINT FK_Path FOREIGN KEY (PathID)
	REFERENCES Paths(PathID)
	ON DELETE CASCADE
	ON UPDATE CASCADE
)
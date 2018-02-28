-- Should create the tables on DARKNET_DATA_DUMP database

CREATE TABLE IF NOT EXISTS BaseURL (
	BaseUrlID bigserial NOT NULL,
	BaseUrl text NOT NULL,
	PRIMARY KEY (BaseUrlID),
	UNIQUE (BaseUrl)
);

CREATE TABLE IF NOT EXISTS Paths(
	PathID bigserial NOT NULL,
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
);

CREATE TABLE IF NOT EXISTS Content(
	ContentID bigserial NOT NULL,
	ScrapeTimestamp BIGINT,
	Content TEXT,
	PathID int NOT NULL,
	PRIMARY KEY (ContentID),
	CONSTRAINT FK_Path FOREIGN KEY (PathID)
	REFERENCES Paths(PathID)
	ON DELETE CASCADE
	ON UPDATE CASCADE
);

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
	Path text NOT NULL,
	BaseUrlID BIGINT NOT NULL,
	PRIMARY KEY (PathID),
	CONSTRAINT FK_BaseUrl FOREIGN KEY (BaseUrlID)
	REFERENCES BaseURL(BaseUrlID)
	ON DELETE CASCADE
	ON UPDATE CASCADE,
	UNIQUE(BaseUrlID, Path)
);

CREATE TABLE IF NOT EXISTS Content(
	ContentID bigserial NOT NULL,
	ScrapeTimestamp BIGINT,
	Content TEXT,
	ContentType TEXT,
	PathID BIGINT NOT NULL,
	PRIMARY KEY (ContentID),
	CONSTRAINT FK_Path FOREIGN KEY (PathID)
	REFERENCES Paths(PathID)
	ON DELETE CASCADE
	ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS Links(
	LinkId bigserial NOT NULL,
	SourceContentId BIGINT NOT NULL,
	DestinationContentId BIGINT NOT NULL,
	PRIMARY KEY (LinkId),
	CONSTRAINT FK_Source FOREIGN KEY (SourceContentId)
	REFERENCES Content(ContentID)
	ON DELETE CASCADE
	ON UPDATE CASCADE,
	CONSTRAINT FK_Destination FOREIGN KEY (DestinationContentId)
	REFERENCES Content(ContentID)
	ON DELETE CASCADE
	ON UPDATE CASCADE,
	UNIQUE(SourceContentId, DestinationContentId)
);
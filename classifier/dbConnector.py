"""Summary
"""
from sqlalchemy.ext.automap import automap_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine
from sqlalchemy import select
from sqlalchemy import func
import progressbar
import psycopg2
import statistics
import logging

class DbConnector(object):
	"""Provides helper functions to access the DB for the ML part
	
	Attributes:
	    Base (TYPE): Description
	    cleanContents (TYPE): Description
	    engine (TYPE): Description
	    labels (TYPE): Description
	    languages (TYPE): Description
	    logger (TYPE): Description
	    positions (TYPE): Description
	    postingPositions (TYPE): Description
	    postings (TYPE): Description
	    Session (TYPE): Description
	    terms (TYPE): Description
	
	Deleted Attributes:
	    conn (TYPE): Description
	    connection (TYPE): Description
	"""
	def __init__(self, dbName, userName, host, port, password):
		"""Summary
		
		Args:
		    dbName (TYPE): Description
		    userName (TYPE): Description
		    host (TYPE): Description
		    port (TYPE): Description
		    password (TYPE): Description
		"""
		super(DbConnector, self).__init__()
		self.logger = logging.getLogger("classifier.DbConnector")
		self.Base = automap_base()
		dbConnectionString = "postgresql+psycopg2://{user}:{pwd}@{host}:{port}/DARKNET_DATA_DUMP".format(
			user=userName,
			pwd=password,
			host=host,
			port=port
		)
		self.engine = create_engine(dbConnectionString)
		self.Session = sessionmaker(bind=self.engine)
		self.Base.prepare(self.engine, reflect=True)
		self.cleanContents = self.Base.classes.cleanContents
		self.labels = self.Base.classes.labels
		self.languages = self.Base.classes.languages
		self.terms = self.Base.classes.terms
		self.positions = self.Base.classes.positions
		self.postingPositions = self.Base.classes.postingPositions
		self.postings = self.Base.classes.postings
		self.logger.info("Up and running")

	def getLanguage(self, languageString, session=None):
		"""Get all languages already stored in the DB
		
		Returns:
		    Array.<Obj>: An array of language objects (tuples), containing
		    			 all the language information
		
		Args:
		    languageString (str): ISO language string
		    session (None, optional): Description
		"""
		if session is None:
			session = self.Session()
		language = session.query(self.languages).filter_by(language=languageString).one()
		session.commit()
		return language, session

	def getAllLabels(self, session=None):
		"""Gets all labels
		
		Returns:
		    TYPE: Description
		
		Args:
		    session (None, optional): Description
		"""
		if session is None:
			session = self.Session()
		labels = session.query(self.labels).all()
		session.commit()
		return labels, session

	def insertLabels(self, labelIdArray, session=None):
		"""Insert labels with given UUID into the labels table
		
		Args:
		    labelIdArray (List.<UUID, str>): A list of <labelId, label> pairs
		    session (None, optional): Description
		
		Returns:
		    TYPE: Description
		"""
		if session is None:
			session = self.Session()

		session.commit()
		return "", session

	def getBagOfWords(self, cleanContentId, dfCutoff):
		"""
		Get the bag of words vector from the database
		for specified clean content. Note: This is slow...
		
		Args:
		    cleanContentId (UUIDv4): The clean content id for which the BoW
		    						 should be built
		    dfCutoff (int): The cutoff value for how in how many
		    				docs a term must occure to be considered.
		    				This is useful, since we need to reduce
		    				the dimensionality of the vector as well
		    				as rare terms are mostly misleading.
		    				Further we try to avoid overfitting with
		    				such an approach.
		"""
		session = self.Session()
		queryString = "\
SELECT COUNT(\"postingPositions\".\"positionId\")\n\
FROM\n\
	(\n\
		SELECT COUNT(postings.\"termTermId\"), terms.\"termId\"\n\
		FROM\n\
			postings\n\
			RIGHT OUTER JOIN terms ON terms.\"termId\" = \
			postings.\"termTermId\" AND postings.\"cleanContentCleanContentId\"\
			 = '{cleanContentId}'\n\
		WHERE terms.\"documentFrequency\" > {dfCutoff} \n\
		GROUP BY terms.\"termId\"\n\
	) boolean\n\
	LEFT OUTER JOIN postings ON postings.\"termTermId\" = boolean.\"termId\"\
	 AND postings.\"cleanContentCleanContentId\" =\
	  '{cleanContentId}'\n\
	LEFT OUTER JOIN \"postingPositions\" ON postings.\"postingId\"\
	 = \"postingPositions\".\"postingId\"\n\
GROUP BY boolean.\"termId\"\n\
ORDER BY boolean.\"termId\" ASC\n".format(
			cleanContentId=cleanContentId,
			dfCutoff=dfCutoff
		)
		queryResult = session.execute(queryString).fetchall()
		session.commit()
		session.close()
		return [i[0] for i in queryResult]

	def getSetOfWords(self, cleanContentId, dfCutoff):
		"""
		Get the set of words vector from the database
		for specified clean content. Note: This is slow...
		
		Args:
		    cleanContentId (UUIDv4): The clean content id for which the SoW
		    						 should be built
		    dfCutoff (int): The cutoff value for how in how many
		    				docs a term must occure to be considered.
		    				This is useful, since we need to reduce
		    				the dimensionality of the vector as well
		    				as rare terms are mostly misleading.
		    				Further we try to avoid overfitting with
		    				such an approach.
		"""
		pass

	def getTrainingData(
		self,
		limit=10000,
		quantile=1,
		mode="bow",
		dfQuantile=0.005,
		languageIds=None,
		session=None
	):
		"""Get randomized trainings data from the database
		
		Args:
			limit (int): Specifies how many entries should be returned
			quantile (float): Specify "how certain" the entry must be in order
							  to be viable
			mode (string): Specify whether you want a BoW (default) or a
						   SoW as result. {"bow", "sow"}
			dfQuantile (float): Acts as a cutoff value and bounds the df from
								below. This ensures that very rare terms are
								not represented in the result vectors. This is
								important in different ways. Once to not
								overfit during training (e.g. if a NN is used)
								and for the other to reduce dimensionality
								with words that are not learnable for our
								system (e.g. a word that only appears in one
								document).
			languageIds (Array.<str>): LanguageId to specify which languages
									   should be contained in the training
									   set. If the param is undefined, all
									   languages are returned.
		"""
		if not mode:
			mode = "bow"
		if session is None:
			session = self.Session()

		cleanContentsCount = session.query(self.cleanContents).count()
		dfCutoff = cleanContentsCount * dfQuantile

		if(languageIds):
			cleanContents = session.query(self.cleanContents).\
				filter((self.cleanContents.legalCertainty + self.cleanContents.labelCertainty)/2 >= quantile).\
				filter(self.cleanContents.languageLanguageId.in_(languageIds)).\
				order_by(func.random()).\
				limit(limit).\
				all()
		else:
			cleanContents = session.query(self.cleanContents).\
				filter((self.cleanContents.legalCertainty + self.cleanContents.labelCertainty)/2 >= quantile).\
				order_by(func.random()).\
				limit(limit).\
				all()


		# Gather all BoW/SoWs
		result = []
		self.logger.info("Fetching vector data from DB:")
		bar = progressbar.ProgressBar(max_value=len(cleanContents))
		bar.start()
		bar.update(0)
		for idx, cleanContent in enumerate(cleanContents):
			if mode == "bow":
				wordVec = self.getBagOfWords(cleanContent.cleanContentId, dfCutoff)
			elif mode == "sow":
				wordVec = self.getSetOfWords(cleanContent.cleanContentId, dfCutoff)
			else:
				logger.error("mode {mode} unknown".format(mode=mode))
				logger.error("Supported modes: 'bow', 'sow'")
				raise ValueError("Faulty mode {mode}".format(mode=mode))
			bar.update(idx)
			result.append((wordVec, cleanContent))
		bar.finish()
		session.commit()
		return result, session


	def getLabellingData(self, limit, mode, dfQuantile, languageIds, session=None):
		"""Get data to apply the model on
		
		Args:
		    limit (int): The number of entries that should be retrieved
		    			 from the database
		    mode (str): Specify whether you want a BoW (default) or a
		    			SoW as result. {"bow", "sow"}
		    dfQuantile (float): Acts as a cutoff value and bounds the df from
		    					below. This ensures that very rare terms are
		    					not represented in the result vectors. This is
		    					important in different ways. Once to not
		    					overfit during training (e.g. if a NN is used)
		    					and for the other to reduce dimensionality
		    					with words that are not learnable for our
		    					system (e.g. a word that only appears in one
		    					document).
		    languageIds (Array.<str>): LanguageId to specify which languages
		    						   should be contained in the training
		    						   set. If the param is undefined, all
		    						   languages are returned.
		    session (Session, optional): An already existing session object for
										 reuse
		
		Returns:
		    Array.<obj>: Contains a cleanContent model and a bag of
		    			 words vector. The words in the bag of word
		    			 vector are always sorted alphabetically
		"""	
		if not mode:
			mode = "bow"
		if session is None:
			session = self.Session()

		cleanContentsCount = session.query(self.cleanContents).count()
		dfCutoff = cleanContentsCount * dfQuantile

		if(languageIds):
			cleanContents = session.query(self.cleanContents).\
				filter((self.cleanContents.legalCertainty + self.cleanContents.labelCertainty)/2 <= 0.1).\
				filter(self.cleanContents.languageLanguageId.in_(languageIds)).\
				order_by(func.random()).\
				limit(limit).\
				all()
		else:
			cleanContents = session.query(self.cleanContents).\
				filter((self.cleanContents.legalCertainty + self.cleanContents.labelCertainty)/2 <= 0.1).\
				order_by(func.random()).\
				limit(limit).\
				all()


		# Gather all BoW/SoWs
		result = []
		percentage = 0;
		bar = progressbar.ProgressBar(max_value=100)
		bar.start()
		bar.update(percentage)
		percentagePerContent = 100./len(cleanContents)
		for cleanContent in cleanContents:
			if mode == "bow":
				wordVec = self.getBagOfWords(cleanContent.cleanContentId, dfCutoff)
			elif mode == "sow":
				wordVec = self.getSetOfWords(cleanContent.cleanContentId, dfCutoff)
			else:
				logger.error("mode {mode} unknown".format(mode=mode))
				logger.error("Supported modes: 'bow', 'sow'")
				raise ValueError("Faulty mode {mode}".format(mode=mode))
			percentage += percentagePerContent
			bar.update(percentage)
			result.append((wordVec, cleanContent))
		bar.finish()
		session.commit()
		return result, session




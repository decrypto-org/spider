"""Runs the classification process

Note: This module expects the databases to be ready and loaded. 
It won't insert missing databases - please use the preprocessor first

Attributes:
    args (TYPE): Description
    ch (TYPE): Description
    fh (TYPE): Description
    formatter (TYPE): Description
    logFile (TYPE): Description
    logger (TYPE): Description
    logLocation (TYPE): Description
    parser (TYPE): Description
"""
from dotenv import load_dotenv
from argparse import ArgumentParser
from sklearn.externals import joblib
from sklearn.preprocessing import StandardScaler
from classifier import Classifier
from dbConnector import DbConnector
from ast import literal_eval
import numpy as np
import os
import json
import logging

load_dotenv()
logLocation = os.environ["LOG_LOCATION"]
logFile = logLocation + "/classifier.log"
if not os.path.exists(logLocation):
	os.makedirs(logLocation)


if not os.path.exists(logFile):
    open(logFile, 'w').close() 

# Initiate logger:
logger = logging.getLogger("classifier")
logger.setLevel(logging.DEBUG)
fh = logging.FileHandler(logFile)
fh.setLevel(logging.DEBUG)
ch = logging.StreamHandler()
ch.setLevel(logging.INFO)
formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")
fh.setFormatter(formatter)
ch.setFormatter(formatter)
logger.addHandler(fh)
logger.addHandler(ch)

# Add args
parser = ArgumentParser()
parser.add_argument(
	"-d", "--labelled_dataset",
	dest="datasetPath",
	type=str,
	help="Training dataset or the form\n\
cleanContentId;legal;label\n\
408751f4-4dab-46a3-a6e1-110b32e9e98b;legal;Mail\n\
32713375-1ae0-42ef-867a-eb855069ab30;legal;Adult\n")
parser.add_argument(
	"-l", "--legal_model",
	dest="legalModelPath",
	type=str,
	help="Specify a model file to be used for the legal\n\
model. If no model is specified, the default\n\
model is used.\n\
")
parser.add_argument(
	"-c", "--label_model",
	dest="labelModelPath",
	type=str,
	help="Specify a model file to be used for the label\n\
model. If no model is specified, the default\n\
model is used.\n\
")
parser.add_argument(
	"-o", "--output_dir",
	dest="outputDir",
	type=str,
	default="./outputModels",
	nargs="?",
	const="./outputModels",
	help="Specify where the model files should be stored.\n\
Default: ./outputModels\n\
")
parser.add_argument(
	"-m", "--mode",
	dest="mode",
	type=str,
	help="train: train the classifier on the training data\n\
available from the db\n\
apply: apply the model to the not yet classified\n\
entries\n\
insert: only insert manuall labelled content, do\n\
nothing else\n\
")
parser.add_argument(
	"--language",
	dest="language",
	type=str,
	help="Train or apply the model only to ccontents of specified language\n\
")
parser.add_argument(
	"-q", "--quantile",
	dest="quantile",
	type=float,
	help="How certain must an entry be in order to belong\n\
to the training set\n\
")
parser.add_argument(
	"-f", "--min_doc_frequency",
	dest="minDocFrequency",
	type=float,
	help="Lower bound for the df of every term. If it is\n\
below the bound, it won't be returned in the\n\
bow/sow. Note that if you train a model with a\n\
given min_doc_frequency, that you need to apply\n\
the model to contents with the same\n\
min_doc_frequency\n\
")
parser.add_argument(
	"-k", "--limit",
	dest="limit",
	type=int,
	help="How many entries should be used for training or\n\
in each labelling step\n\
")
parser.add_argument(
	"--svmType",
	dest="svmType",
	type=str,
	help="Possible values: C_SVC, NU_SVC, LinearSVC\n\
")
parser.add_argument(
	"--kernelType",
	dest="kernelType",
	type=str,
	help="Possile values: linear, polynomial, rbf, sigmoid\n\
")
parser.add_argument(
	"--cost",
	dest="cost",
	type=float,
	help="Can be a number or an array of numbers\n\
")
parser.add_argument(
	"--nu",
	dest="nu",
	type=float,
	help="For NU_SVC or ONE_CLASS. Can be a number or an array of numbers\n\
")
parser.add_argument(
	"--degree",
	dest="degree",
	type=int,
	help="For POLY kernel, number or array of numbers\n\
")
parser.add_argument(
	"--gamma",
	dest="gamma",
	type=float,
	help="For POLY, RBF and SIGMOID\n\
")
parser.add_argument(
	"--rp",
	dest="rValue",
	type=float,
	help="For Poly and SIGMOID\n\
")
parser.add_argument(
	"--kfold",
	dest="kFold",
	type=int,
	help="Parameter for k-fold cross validation\n"
)
parser.add_argument(
	"--eps",
	dest="eps",
	type=float,
	help="Tolerance of termination criterion\n\
")
parser.add_argument(
	"--cacheSize",
	dest="cacheSize",
	type=int,
	help="Cach size in MB\n\
")
parser.add_argument(
	"--shrinking",
	dest="shrinking",
	type=bool,
	help="Whether to use the shrinking heuristics\n\
")
parser.add_argument(
	"--probability",
	dest="probability",
	type=bool,
	help="Train model for probability estimates"
)

args = parser.parse_args()

####################################################################
# Initiate main code run                                           #
####################################################################

def storeModel(path, classifier):
	"""Summary
	
	Args:
	    path (TYPE): Description
	    classifier (TYPE): Description
	"""
	joblib.dump(classifier, path)

def restoreModel(path, name):
	"""Summary
	
	Args:
	    path (TYPE): Description
	    name (TYPE): Description
	
	Returns:
	    TYPE: Description
	"""
	model = joblib.load(path)
	return Classifier.fromModel(model, name)

def loadAndInsertLabels():
	"""Summary
	"""
	with open("labels.json") as labelsFile:
		data = json.load(labelsFile)


def run():
	"""Run the classification process 
	
	Raises:
	    SystemExit: Description
	"""
	destinationPath = args.outputDir if args.outputDir is not None else os.environ["CLASSIFIER_OUTPUT_DIR"]
	if not destinationPath:
		destinationPath = "./outputModels/%s"

	legalPath = destinationPath + "/legalModel.clf"
	labelPath = destinationPath + "/labelModel.clf"
	scalePath = destinationPath + "/scaleModel.clf"

	svmType = args.svmType if args.svmType is not None else os.environ["CLASSIFIER_SVM_TYPE"]
	kernelType = args.kernelType if args.kernelType is not None else os.environ["CLASSIFIER_KERNEL_TYPE"]
	cost = args.cost if args.cost is not None else literal_eval(os.environ["CLASSIFIER_COST"])
	nu = args.nu if args.nu is not None else literal_eval(os.environ["CLASSIFIER_NU"])
	degree = args.degree if args.degree is not None else literal_eval(os.environ["CLASSIFIER_DEGREE"])
	gamma = args.gamma if args.gamma is not None else literal_eval(os.environ["CLASSIFIER_GAMMA"])
	rValue = args.rValue if args.rValue is not None else literal_eval(os.environ["CLASSIFIER_R"])
	kFold = args.kFold if args.kFold is not None else literal_eval(os.environ["CLASSIFIER_KFOLD"])
	cacheSize = args.cacheSize if args.cacheSize is not None else literal_eval(os.environ["CLASSIFIER_CACHE_SIZE"])
	shrinking = args.shrinking if args.shrinking is not None else literal_eval(os.environ["CLASSIFIER_SHRINKING"])
	probability = args.probability if args.probability is not None else literal_eval(os.environ["CLASSIFIER_PROBABILITY"])
	tol = args.eps if args.eps is not None else literal_eval(os.environ["CLASSIFIER_EPS"])

	labelClfTrained = False
	legalClfTrained = False
	scaleModelTrained = False
	try:
		labelClf = restoreModel(labelPath, "LabelClassifier")
		labelClfTrained = True
	except Exception as e:
		logger.exception(str(e))
		try:
			labelClf = Classifier.fromParams(
				svmType=svmType,
				kernelType=kernelType,
				cost=cost,
				nu=nu,
				degree=degree,
				gamma=gamma,
				rValue=rValue,
				kFold=kFold,
				cacheSize=cacheSize,
				shrinking=shrinking,
				probability=probability,
				tol=tol,
				name="LabelClassifier"
			)
		except Exception as e:
			logger.exception(str(e))
			logger.error("Could not create label classifier instance")
			raise SystemExit(-1)

	try:
		legalClf = restoreModel(legalPath, "LegalClassifier")
		legalClfTrained = True
	except Exception as e:
		logger.exception(str(e))
		try:
			legalClf = Classifier.fromParams(
				svmType=svmType,
				kernelType=kernelType,
				cost=cost,
				nu=nu,
				degree=degree,
				gamma=gamma,
				rValue=rValue,
				kFold=kFold,
				cacheSize=cacheSize,
				shrinking=shrinking,
				probability=probability,
				tol=tol,
				name="LegalClassifier"
			)
		except Exception as e:
			logger.exception(str(e))
			logger.error("Could not creat legal classifier instance")
			raise SystemExit(-1)
	try:
		scaler = joblib.load(scalePath)
		scaleModelTrained = True
	except Exception as e:
		try:
			scaler = StandardScaler()
		except Exception as e:
			logger.exception(str(e))
			logger.error("could not create scaler - giving up")
			raise SystemExit(-1)

	db = DbConnector(
		dbName=os.environ["TDSE_DB_NAME"],
		userName=os.environ["TDSE_DB_USER"],
		host=os.environ["DB_HOST"],
		port=os.environ["TDSE_DB_PORT"],
		password=os.environ["TDSE_DB_PASSWORD"]
	)

	labels, labelSession = db.getAllLabels()
	if len(labels) == 0:
		labels = loadAndInsertLabels()
	labelModelsByLabel = {}
	for label in labels:
		labelModelsByLabel[label.label] = label
	mode = args.mode;
	if not mode:
		if args.labelledDataset:
			mode = "train"
		elif labelClfTrained and legalClfTrained:
			mode = "apply"
		else:
			logger.error("Cannot apply empty models. Please train first")
			raise SystemExit(-1)
	else:
		if mode == "apply" and not labelClfTrained and not legalClfTrained:
			logger.error("Cannot apply empty models. Please train first")
			raise SystemExit(-1)

	language = args.language if args.language is not None else os.environ["CLASSIFIER_LANGUAGE"]

	languageId = None
	if language is not None and language != "all":
		languageModel, languageSession = db.getLanguage(language)
		languageId = languageModel.languageId
	dfQuantile = args.minDocFrequency if args.minDocFrequency is not None else literal_eval(os.environ["CLASSIFIER_MIN_DF_FREQ"])
	quantile = args.quantile if args.quantile is not None else literal_eval(os.environ["CLASSIFIER_QUANTILE"])
	limit = args.limit if args.limit is not None else literal_eval(os.environ["CLASSIFIER_LIMIT"])

	if mode == "train":
		dataset, trainingSession = db.getTrainingData(
			limit=limit,
			quantile=quantile,
			mode="bow",
			dfQuantile=dfQuantile,
			languageIds=tuple([languageId])
		)
		X_train = []
		Y_label = []
		Y_legal = []
		for dataEntry in dataset:
			X_train.append(dataEntry[0])
			model = dataEntry[1]
			Y_legal.append(1 if model.legal else 0)
			Y_label.append(model.primaryLabelLabelId)
		X_train = np.array(X_train)
		Y_legal = np.array(Y_legal)
		Y_label = np.array(Y_label)

		# Init scaler if not yet done
		scaler.fit(X_train)
		X_train = scaler.transform(X_train)

		# store scaler (will be needed in the application phase)
		storeModel(scalePath, scaler)

		# train both classifiers
		labelClf.train(X_train, Y_label)
		legalClf.train(X_train, Y_legal)

		storeModel(labelPath, labelClf.clf)
		storeModel(legalPath, legalClf.clf)
	elif mode == "apply":
		dataset, labellingSession = db.getLabellingData(
				limit=limit,
				mode="bow",
				dfQuantile=dfQuantile,
				languageId=languageId
			)
		while dataset.length >= limit:
			dataset = db.getLabellingData(
				limit=limit,
				mode="bow",
				dfQuantile=dfQuantile,
				languageId=languageId,
				session=labellingSession
			)
			# Todo: apply model to dataset => and write back to db
			# Insertion via: Insert => on conflict do update legal&label => this way we get



try:
	run()
except Exception as e:
	logger.exception(str(e))
	raise SystemExit(-1)


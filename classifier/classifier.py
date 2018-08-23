from sklearn import svm
from sklearn.utils import shuffle
from sklearn.model_selection import cross_val_score
import numpy as np
import logging

class Classifier(object):
	"""docstring for Classifier"""
	def __init__(self, clf, name="Classifier"):
		super(Classifier, self).__init__()
		self.logger = logging.getLogger("classifier.{name}".format(name=name))
		self.clf = clf

		self.logger.info("Up and ready")

	@classmethod
	def fromModel(cls, model, name="classifier"):
		return cls(model, name)

	@classmethod
	def fromParams(
		cls,
		svmType="C_SVC",
		kernelType="linear",
		cost=10,
		nu=1,
		degree=4,
		gamma=30,
		rValue=2,
		kFold=4,
		cacheSize=1024,
		shrinking=True,
		probability=False,
		tol=0.001,
		name="classifier"
	):
		clf = None
		if type(gamma) is not float:
			gamma="auto"
		if svmType == "C_SVC":
			clf = svm.SVC(
				C=cost,
				kernel=kernelType,
				degree=degree,
				gamma=gamma,
				coef0=0.0,
				shrinking=shrinking,
				probability=probability,
				tol=tol,
				cache_size=cacheSize,
				verbose=False,
				max_iter=-1,
				decision_function_shape="ovr",
				random_state=None
			)
		elif svmType == "NU_SVC":
			clf = svm.NuSVC(
				nu=nu,
				kernel=kernelType,
				degree=degree,
				gamma=gamma,
				coef0=0.0,
				shrinking=shrinking,
				probability=probability,
				tol=tol,
				cache_size=cacheSize,
				verbose=False,
				max_iter=-1,
				decision_function_shape="ovr",
				random_state=None
			)
		elif svmType == "LinearSVC":
			clf = svm.LinearSVC(
				penalty="l2",
				loss="squared_hinge",
				dual=True,
				tol=tol,
				C=cost,
				multi_class="ovr",
				fit_intercept=True,
				intercept_scaling=1,
				verbose=0,
				random_state=None,
				max_iter=1000
			)
		else:
			raise Exception("Unknown SVM type: {svmType}".format(svmType=svmType))
		return(cls(clf, name))

	def train(self, datacolumns, targetcolumn):
		self.logger.info("Training...")
		result = self.clf.fit(datacolumns, targetcolumn)
		self.logger.info("Training finished: {output}".format(output=result))
		for scoring in ["accuracy", "average_precision", "f1_micro", "f1_macro", "neg_log_loss", "precision_micro","precision_macro", "recall_micro", "recall_macro"]:
			result = cross_val_score(self.clf, datacolumns, targetcolumn, scoring=scoring)
			self.logger.info("Cross validation {scoringScheme}: {result}".format(scoringScheme=scoring, result=result))

	def apply(self, datacolumns):
		self.logger.info("Applying...")
		scores = self.clf.decision_function(datacolumns)
		probaScores = self.clf.predict_proba(datacolumns)
		results = []
		for i in range(0, len(datacolumns)):
			scoreMax = np.max(scores[i])
			probaMax = np.max(probaScores[i])
			try:
				scorePos = [i for i,x in enumerate(scores[i]) if x == scoreMax][0]
				scoreDecision = self.clf.classes_[scorePos]
			except Exception as e:
				scoreMax = np.max(scores[i])
				scoreDecision = 0 if scoreMax < 0 else 1
				scorePos = scoreDecision
			probaPos = [i for i,x in enumerate(probaScores[i]) if x == probaMax][0]
			scoreProba = probaScores[i][scorePos]
			probaDecision = self.clf.classes_[probaPos]
			if probaDecision == scoreDecision:
				scoreProba *= 2
			# The machine should never reach a human decision certainty - therefor
			# capping at 99%
			if scoreProba > 0.99:
				scoreProba = 0.99
			results.append((scoreDecision, scoreProba))
		return results

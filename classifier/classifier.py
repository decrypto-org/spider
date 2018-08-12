from sklearn import svm
import logging

class Classifier(object):
	"""docstring for Classifier"""
	def __init__(self, clf, name="Classifier"):
		super(Classifier, self).__init__()
		self.logger = logging.getLogger("classifier.{name}".format(name=name))
		self.clf = None

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

	def train(datacolumns, targetcolumn):
		self.logger.info("Training...")

	def apply(datacolumns):
		self.logger.info("Applying...")

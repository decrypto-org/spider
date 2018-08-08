let dotenv = require("dotenv");
let variableExpansion = require("dotenv-expand");
let svm = require("./node-svm/lib");
let commandLineArgs = require("command-line-args");
let csvjson = require("csvjson");
let fs = require("fs");
let path = require("path");

let classifierEnv = dotenv.config();
variableExpansion(classifierEnv);

// We need the env loaded first ^v
let db = require("./models");
let Op = db.Sequelize.Op;

// Read input - if we have any: this should be a manually labelled dataset
// mode supports either train, apply or insert
// train: train the classifier on the training data available from the db
// apply: apply the model to the not yet classified entries
// insert: only insert manuall labelled content, do nothing else
const commandLineOptions = commandLineArgs([
    {name: "labelled_dataset", alias: "d", type: String, defaultOption: true},
    {name: "legal_model", alias: "l", type: String},
    {name: "label_model", alias: "c", type: String},
    {name: "output_dir", alias: "o", type: String},
    {name: "mode", alias: "m", type: String},
    {name: "quantile", alias: "q", type: Number},
    {name: "min_doc_frequency", alias: "f", type: Number},
    {name: "limit", alias: "k", type: Number},
    {name: "help", alias: "h", type: Boolean},
    {name: "svmType", type: String},
    {name: "kernelType", type: String},
    {name: "cost", type: Number},
    {name: "nu", type: Number},
    {name: "degree", type: Number},
    {name: "gamma", type: Number},
    {name: "rp", type: Number},
    {name: "kfold", type: Number},
    {name: "normalize", type: Boolean},
    {name: "reduce", type: Boolean},
    {name: "retainedvariance", type: Number},
    {name: "eps", type: Number},
    {name: "cacheSize", type: Number},
    {name: "shrinking", type: Boolean},
    {name: "probability", type: Boolean},
]);

if (commandLineOptions.help) {
    /* eslint-disable no-multi-str*/
    console.log("\
-d, --labelled_dataset      Training dataset or the form\n\
                            cleanContentId;legal;label\n\
                            408751f4-4dab-46a3-a6e1-110b32e9e98b;legal;Mail\n\
                            32713375-1ae0-42ef-867a-eb855069ab30;legal;Adult\n\
-l, --legal_model           Specify a model file to be used for the legal\n\
                            model. If no model is specified, the default\n\
                            model is used.\n\
-c, --label_model           Specify a model file to be used for the label\n\
                            model. If no model is specified, the default\n\
                            model is used.\n\
-o, --output_dir            Specify where the model files should be stored.\n\
                            Default: ./outputModels\n\
-m, --mode                  train: train the classifier on the training data\n\
                            available from the db\n\
                            apply: apply the model to the not yet classified\n\
                            entries\n\
                            insert: only insert manuall labelled content, do\n\
                            nothing else\n\
-q, --quantile              How certain must an entry be in order to belong\n\
                            to the training set\n\
-f, --min_doc_frequency     Lower bound for the df of every term. If it is\n\
                            below the bound, it won't be returned in the\n\
                            bow/sow. Note that if you train a model with a\n\
                            given min_doc_frequency, that you need to apply\n\
                            the model to contents with the same\n\
                            min_doc_frequency\n\
-k, --limit                 How many entries should be used for training or\n\
                            in each labelling step\n\
-h, --help                  Show this help menu\n\n\
Settings for the classifier itself:\n\
--svmType                   Possible values: C_SVC, NU_SVC, ONE_CLASS\n\
--kernelType                Possile values: LINEAR, POLY, RBF, SIGMOID\n\
--cost                      Can be a number or an array of numbers\n\
--nu                        For NU_SVC or ONE_CLASS. Can be a number or\n\
                            an array of numbers\n\
--degree                    For POLY kernel, number or array of numbers\n\
--gamma                     For POLY, RBF and SIGMOID\n\
--rp                        For Poly and SIGMOID\n\
--kfold                     Parameter for k-fold cross validation\n\
--normalize                 Whether to use mean normalization during\n\
                            data preprocessing\n\
--reduce                    Whether to use PCA to reduce dimensionality\n\
--retainedvariance          Define acceptable impact on data integrity (PCA)\n\
--eps                       Tolerance of termination criterion\n\
--cacheSize                 Cach size in MB\n\
--shrinking                 Whether to use the shrinking heuristics\n\
--probability               Train model for probability estimates");
    /* eslint-enable no-multi-str */
    process.exit(0);
}

let labelModelsByLabel;

// MODEL variable is instantiated here, in order to save it to disk
// in case of a crash. Every crash handler has access to the model
// and the storeModel function.
let labelModel;
let legalModel;
let labelIdByClassId = {};
let classIdByLabelId = {};

/**
 * Return a human readable timestamp without whitespaces. This way it is useful
 * for filenames, folders as well as log output.
 * @return {String} A string of the current timestamp. Precision: seconds
 */
function getTimestamp() {
    return new Date(Date.now()).toUTCString().replace(/[\s,:]+/g, "-");
}

/**
 * Check if model files are available or specified on startup and load the
 * corresponding models. The file names are labelModel.json and legalModel.json.
 * If none available, initialize the models as null model.
 * The function does not return anything but makes the models available in the
 * respective global variables labelModel and legalModel.
 */
function loadModels() {
    /**
     * Takes the provided path string and returns the loaded object
     * @param  {String} sourceString The path to the model file
     * @return {Object} The model read or empty model if not found any model
     */
    function loader(sourceString) {
        let rawPath = null;
        if (sourceString &&
            !path.isAbsolute(sourceString)) {
            rawPath = path.join(
                __dirname,
                sourceString
            );
            rawPath = path.normalize(rawPath);
        } else if (sourceString) {
            rawPath = path.normalize(sourceString);
        } else {
            rawPath = path.join(
                __dirname,
                "outputModels/legalModel.json"
            );
        }

        try {
            let modelString = fs.readFileSync(
                rawPath,
                {encoding: "utf8"}
            );
            return JSON.parse(modelString);
        } catch (e) {
            console.log("No model found in directory " + rawPath);
            console.log("Using empty model");
            return {};
        }
    }

    legalModel = loader(commandLineOptions.legal_model);
    labelModel = loader(commandLineOptions.label_model);
    labelIdByClassId = labelModel.labelIdByClassId || {};
    classIdByLabelId = labelModel.classIdByLabelId || {};
    // Now we need to set the labelModel to the trained model only, without
    // ID mapping
    labelModel = labelModel.model;
}

/**
 * Return the path to the destination folder for all outputs of the classifier.
 * @return {String} The path to the destination folder
 */
function getStorePath() {
    let destinationPath = commandLineOptions.output_dir;
    if (!destinationPath) {
        destinationPath = process.env.CLASSIFIER_OUTPUT_DIR;
    }
    if (
        destinationPath &&
        !path.isAbsolute(destinationPath)
    ) {
        destinationPath = path.join(
            __dirname,
            destinationPath
        );
        destinationPath = path.normalize(destinationPath);
    } else if (destinationPath) {
        destinationPath = path.normalize(destinationPath);
    } else {
        destinationPath = path.join(
            __dirname,
            "outputModels"
        );
    }
    return destinationPath;
}

/**
 * Store the currently trained model into model.json file. This is necessary in
 * order to not loose the progress made so far. That way we can train further
 * from run to run
 */
function storeModels() {
    let destinationPath = getStorePath();
    let legalModelDestPath = path.join(
        destinationPath,
        "legalModel.json"
    );
    fs.writeFileSync(legalModelDestPath, JSON.stringify(legalModel), "utf-8");
    let labelModelDestPath = path.join(
        destinationPath,
        "labelModel.json"
    );
    let storeClassModel = {
        labelIdByClassId: labelIdByClassId,
        classIdByLabelId: classIdByLabelId,
        model: labelModel,
    };
    fs.writeFileSync(
        labelModelDestPath,
        JSON.stringify(storeClassModel),
        "utf-8"
    );
}

/**
 * Store a report of the learning algorithm in a file persistently, to revisit
 * the results of the process. This includes all necessary measurement scores
 * to evaluate the quality of the trained classifier.
 * @param  {Object} report Object which contains all the evaluation scores
 */
function storeReport(report) {
    let filename = "Report_" + getTimestamp();
    let destPath = getStorePath();
    let fullPath = path.join(
        destPath,
        filename
    );
    fs.writeFileSync(
        fullPath,
        JSON.stringify(report),
        "utf-8"
    );
}

/**
 * Insert or update labels according to the labels.json config file.
 * This results in up to date label descriptions.
 * @return {Object} Return an object indexed by label, containing the model
 *                         for each label.
 */
async function upsertLabels() {
    let labelsPath = path.join(
        __dirname,
        "labels.json"
    );
    let labelString = fs.readFileSync(labelsPath);
    let labelsRawObject = JSON.parse(labelString);
    let labels = await db.label.bulkUpsert(labelsRawObject.labels);
    let result = {};
    for ( let i = 0; i < labels.length; i++ ) {
        result[labels[i].label] = labels[i];
    }
    return result;
}

/**
 * Add train data to the database. This must follow the provided example below:
 * cleanContentId;legal;label
 * 408751f4-4dab-46a3-a6e1-110b32e9e98b;legal;Mail
 * 32713375-1ae0-42ef-867a-eb855069ab30;legal;Hosting
 * Please check the already available classes in ./labels.json and see if you
 * find a good fit there. If not, please discuss the introduction of new classes
 * in a feedback.
 * The title in the file is important, this function expects the file to contain
 * such a title
 */
async function addTrainData() {
    let pathToLabelledData;
    let labelledData = [];
    if (commandLineOptions.labelled_dataset &&
        !path.isAbsolute(commandLineOptions.labelled_dataset)) {
        pathToLabelledData = path.join(
            __dirname,
            commandLineOptions.labelled_dataset
        );
        pathToLabelledData = path.normalize(pathToLabelledData);
    } else if (commandLineOptions.labelled_dataset) {
        pathToLabelledData = path.normalize(
            commandLineOptions.labelled_dataset
        );
    }
    if (!pathToLabelledData) {
        console.log("No labelled data provided.");
        return;
    }

    let csvData = fs.readFileSync(
        pathToLabelledData,
        {encoding: "utf8"}
    );

    let csvOptions = {
        delimiter: ";",
        quote: "\"",
    };

    labelledData = csvjson.toObject(csvData, csvOptions);
    for ( let i = 0; i < labelledData.length; i++ ) {
        let legalCertainty = 1.0;
        let labelCertainty = 1.0;
        let label = labelledData[i].label || "";
        let legal = "legal" == labelledData[i].legal;
        let primaryLabelId;
        try {
            primaryLabelId = labelModelsByLabel[label].labelId;
        } catch (e) {
            // statements
        console.log("Label; " + label);
            console.log("PANIC");
        }
        if (!primaryLabelId) {
            console.error("PANIC");
        }
        await db.cleanContent.update({
            primaryLabelLabelId: primaryLabelId,
            legal: legal,
            legalCertainty: legalCertainty,
            labelCertainty: labelCertainty,
        }, {
            where: {
                cleanContentId: {
                    [Op.eq]: labelledData[i].cleanContentId,
                },
            },
        });
    }
}

/**
 * Train the model on the passed data set. The function does not return anything
 * but updates the models in the global variables.
 * @param  {Array.<Object>} dataset The object contain a clean content model, a
 *                                  BoW vector and the expected labels legal and
 *                                  class id.
 */
async function trainModel(dataset) {
    /**
     * Print progress updates and state updates to stdout
     * @param  {?} rate The rate arg provided by the svm lib used - TODO: see
     *                  what it contains
     */
    // function printProgress(rate) {
    //     process.stdout.clearLine();
    //     process.stdout.cursorTo(0);
    //     process.stdout.write("[Training model] Progress: " + rate + "%");
    // }
    // First train class model
    console.log("\nTrain class model");
    let classDataset = [];
    let legalDataset = [];
    let currentClassId = 0;
    for (let i = 0; i < dataset.length; i++) {
        let labelId = dataset[i].model.primaryLabelLabelId;
        if (Object.keys(classIdByLabelId).indexOf(labelId) <= 0) {
            classIdByLabelId[labelId] = currentClassId;
            labelIdByClassId[currentClassId] = labelId;
            currentClassId += 1;
        }
        let row = [dataset[i].wordVec, classIdByLabelId[labelId]];
        classDataset.push(row);
        row = [dataset[i].wordVec, dataset[i].model.legal];
        legalDataset.push(row);
    }
    let clf = new svm.SVM({
        svmType: commandLineOptions.svmType
            || process.env.CLASSIFIER_SVM_TYPE
            || "C_SVC",
        c: commandLineOptions.cost
            || Number.parseInt(process.env.CLASSIFIER_COST, 10)
            || 1,
        // kernels parameters
        kernelType: commandLineOptions.kernelType
            || process.env.CLASSIFIER_KERNEL_TYPE
            || "RBF",
        nu: commandLineOptions.nu
            || Number.parseFloat(process.env.CLASSIFIER_NU)
            || [0.01, 0.125, 0.5, 1],
        gamma: commandLineOptions.gamma
            || Number.parseFloat(process.env.CLASSIFIER_GAMMA)
            || [0.03125, 0.125, 0.5, 2, 8],
        degree: commandLineOptions.degree
            || Number.parseInt(process.env.CLASSIFIER_DEGREE, 10)
            || [2, 3, 4],
        r: commandLineOptions.rp
            || Number.parseFloat(process.env.CLASSIFIER_R)
            || [0.125, 0.5, 0, 1],
        // training options
        kFold: commandLineOptions.kfold
            || Number.parseInt(process.env.CLASSIFIER_KFOLD, 10)
            || 4,
        normalize: commandLineOptions.normalize
            || process.env.CLASSIFIER_NORMALIZE === "true"
            || true,
        reduce: commandLineOptions.reduce
            || process.env.CLASSIFIER_REDUCE === "true"
            || true,
        retainedVariance: commandLineOptions.retainedvariance
            || Number.parseFloat(process.env.CLASSIFIER_RETAINED_VARIANCE)
            || 0.99,
        eps: commandLineOptions.eps
            || Number.parseFloat(process.env.CLASSIFIER_EPS)
            || 0.001,
        cacheSize: commandLineOptions.cacheSize
            || Number.parseInt(process.env.CLASSIFIER_CACHE_SIZE, 10)
            || 200,
        shrinking: commandLineOptions.shrinking
            || process.env.CLASSIFIER_SHRINKING === "true"
            || true,
        probability: commandLineOptions.probability
            || process.env.CLASSIFIER_PROBABILITY === "true"
            || false,
    });
    let model;
    let report;
    try {
        [model, report] = await clf.train(classDataset);
        storeReport(report);
        console.log("Report: ");
        console.log(JSON.stringify(report));
    } catch (e) {
        console.error("CLF Training failed with");
        console.log(e);
        model = {};
    }
    labelModel = model;
    storeModels();

    console.log("Train legal model");
    let llf = new svm.CSVC({
        kFold: 4,
        normalize: true,
        reduce: true,
        cacheSize: 1024,
        shrinking: true,
        probability: true,
        gamma: 2,
        c: 10,
        eps: 10,
    });

    try {
        [model, report] = await llf.train(legalDataset);
        storeReport(report);
        console.log("Report:");
        console.log(JSON.stringify(report));
    } catch (e) {
        console.error("LLF Training failed with: ");
        console.log(e);
        model = {};
    }
    legalModel = model;
    storeModels();
}

/**
 * Apply the model to the provided dataset. The function does not return
 * anything, but updates the entries directly on the database (e.g. set
 * primary label and legal status).
 * @param  {Arra.<Object>} dataset The objects contain a clean content model and
 *                                 a BoW vector. The estimated labels and
 *                                 certainties can then be directly written
 *                                 onto the clean content model to be
 *                                 persistently stored in the database
 */
async function applyModel(dataset) {
    // body...
}


/**
 * Run the whole process and keeps track of the state of the classifier. Manages
 * the control flow ("Controller function")
 */
async function run() {
    process
    .on("unhandledRejection", (reason, p) => {
        console.error(reason, "Unhandled Rejection at Promise", p);
        storeModels();
        process.exit(-1);
    })
    .on("uncaughtException", (err) => {
        console.error(err, "Uncaught Exception thrown");
        storeModels();
        process.exit(-1);
    });
    await db.sequelize.sync();
    // first check the mode we should run in...
    // mode supports either train, apply or insert
    // train: train the classifier on the training data available from the db
    // apply: apply the model to the not yet classified entries
    // insert: only insert manuall labelled content, do nothing else
    // default:
    //      no train file specified: apply
    //      train specified: insert, then train
    await loadModels();
    labelModelsByLabel = await upsertLabels();
    let mode = commandLineOptions.mode;
    if ( !mode ) {
        if ( commandLineOptions.labelled_dataset ) {
            mode = "train";
        } else if ( legalModel != {} && labelModel != {} ) {
            mode = "apply";
        } else {
            // No need to store models here, since they are empty (default)
            console.log("Cannot apply empty model. Please train first");
            process.exit(-1);
        }
    } else {
        if (
            mode === "apply"
            && legalModel == {}
            && labelModel == {}
        ) {
            // No need to store models here, since they are empty (default)
            console.log("Cannot apply empty model. Please train first");
            process.exit(-1);
        }
    }
    if ( commandLineOptions.labelled_dataset ) {
        await addTrainData();
    }
    let language = commandLineOptions.language
        || process.env.CLASSIFIER_LANGUAGE;
    let languageId;
    if ( language && language != "all" ) {
        let languageModel = await db.language.findAll({
            limit: 1,
            where: {
                language: language
            }
        });
        languageId = languageModel[0].languageId;
    }
    let dfQuantile = commandLineOptions.min_doc_frequency
        || Number.parseFloat(process.env.CLASSIFIER_MIN_DF_FREQ)
        || 0;
    let quantile =
        commandLineOptions.quantile
        || Number.parseFloat(process.env.CLASSIFIER_QUANTILE)
        || 0.001;
    let limit =
        commandLineOptions.limit
        || Number.parseInt(process.env.CLASSIFIER_LIMIT)
        || 10000;
    if (mode === "train") {
        let dataset = await db.cleanContent.getTrainingData(
            limit,
            quantile,
            "bow", /* mode */
            dfQuantile,
            languageId
        );
        await trainModel(dataset);
        storeModels();
        do {
            dataset = await db.cleanContent.getLabellingData(
                limit,
                "bow", /* mode */
                dfQuantile,
                languageId
            );
            await applyModel(dataset);
        } while (dataset.length >= limit);
    } else if (mode === "apply") {
        let dataset;
        do {
            dataset = await db.cleanContent.getLabellingData(
                limit,
                "bow", /* mode */
                dfQuantile,
                languageId
            );
            await applyModel(dataset);
        } while (dataset.length >= limit);
    }
    console.log("Finished. Bye bye ...");
    process.exit(0);
}

run();

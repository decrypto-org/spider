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
    {name: "class_model", alias: "c", type: String},
    {name: "output_dir", alias: "o", type: String},
    {name: "mode", alias: "m", type: String},
    {name: "quantile", alias: "q", type: Number},
    {name: "limit", alias: "k", type: Number},
    {name: "help", alias: "h", type: Boolean}
]);

if (commandLineOptions.help) {
    /* eslint-disable no-multi-str*/
    console.log("\
-d, --labelled_dataset      Training dataset or the form\n\
                            cleanContentId;legal;label\n\
                            408751f4-4dab-46a3-a6e1-110b32e9e98b;legal;Mail\n\
                            32713375-1ae0-42ef-867a-eb855069ab30;legal;Adult\n\
-l, --legal_model           Specify a model file to be used for the legal\
 model.\n\
                            If no model is specified, the default model is\
 used.\n\
-l, --legal_model           Specify a model file to be used for the class\
 model.\n\
                            If no model is specified, the default model is\
 used.\n\
-o, --output_dir            Specify where the model files should be stored.\n\
                            Default: ./outputModels\n\
-m, --mode                  train: train the classifier on the training data\
 available from the db\n\
                            apply: apply the model to the not yet classified\
 entries\n\
                            insert: only insert manuall labelled content, do\
 nothing else\n\
-q, --quantile              How certain must an entry be in order to belong to\
 the training set\n\
-k, --limit                 How many entries should be used for training or\
 in each labelling step\n\
-h, --help                  Show this help menu");
    /* eslint-enable no-multi-str */
    process.exit(0);
}

let labelModelsByLabel;

// MODEL variable is instantiated here, in order to save it to disk
// in case of a crash. Every crash handler has access to the model
// and the storeModel function.
let classModel;
let legalModel;

/**
 * Check if model files are available or specified on startup and load the
 * corresponding models. The file names are classModel.json and legalModel.json.
 * If none available, initialize the models as null model.
 * The function does not return anything but makes the models available in the
 * respective global variables classModel and legalModel.
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
    classModel = loader(commandLineOptions.class_model);
}

/**
 * Store the currently trained model into model.json file. This is necessary in
 * order to not loose the progress made so far. That way we can train further
 * from run to run
 */
function storeModels() {
    let destinationPath = commandLineOptions.output_dir;
    if (
        destinationPath &&
        !path.isAbsolute(destinationPath)
    ) {
        destinationPath = path.join(
            __dirname,
            destinationPath
        );
        destinationPath.normalize(destinationPath);
    } else if (destinationPath) {
        destinationPath.normalize(destinationPath);
    } else {
        destinationPath = path.join(
            __dirname,
            "outputModels"
        );
    }
    let legalModelDestPath = path.join(
        destinationPath,
        "legalModel.json"
    );
    fs.writeFileSync(legalModelDestPath, JSON.stringify(legalModel), "utf-8");
    let classModelDestPath = path.join(
        destinationPath,
        "classModel.json"
    );
    fs.writeFileSync(classModelDestPath, JSON.stringify(classModel), "utf-8");
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
        let classCertainty = 1.0;
        let label = labelledData[i].label || "";
        let legal = "legal" == labelledData[i].legal;
        let primaryLabelId;
        try {
            primaryLabelId = labelModelsByLabel[label].labelId;
        } catch (e) {
            // statements
            console.log("PANIC");
        }
        if (!primaryLabelId) {
            console.error("PANIC");
        }
        await db.cleanContent.update({
            primaryLabelLabelId: primaryLabelId,
            legal: legal,
            legalCertainty: legalCertainty,
            classCertainty: classCertainty,
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
    let clf = new svm.C_SVC({
        kFold: 4,
        normalize: true,
        reduce: true,
        cacheSize: 1024,
        shrinking: true,
        probability: true,
    });

    clf
        .train(dataset)
        .progress((rate) => {
            // log to stdout
        })
        .spread((model, report) => {
            // log report
            // store model
            // go ahead and apply model ==> should be handled by the run func
            // this is only the backbone structure
        });
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
        storeModels();
        console.error(reason, "Unhandled Rejection at Promise", p);
        process.exit(-1);
    })
    .on("uncaughtException", (err) => {
        storeModels();
        console.error(err, "Uncaught Exception thrown");
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
        } else if ( legalModel != {} && classModel != {} ) {
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
            && classModel == {}
        ) {
            // No need to store models here, since they are empty (default)
            console.log("Cannot apply empty model. Please train first");
            process.exit(-1);
        }
    }
    if ( commandLineOptions.labelled_dataset ) {
        await addTrainData();
    }
    let quantile =
        commandLineOptions.quantile
        || Number.parseFloat(process.env.CLASSIFIER_QUANTILE)
        || 0.001;
    let limit =
        commandLineOptions.limit
        || Number.parseInt(process.env.CLASSIFIER_LIMIT)
        || 10000;
    if (mode === "train") {
        let dataset = await db.cleanContent.getTrainingData(limit, quantile);
        await trainModel(dataset);
        storeModels();
        do {
            dataset = await db.cleanContent.getLabellingData(limit);
            await applyModel(dataset);
        } while (dataset.length >= limit);
    } else if (mode === "apply") {
        let dataset;
        do {
            dataset = await db.cleanContent.getLabellingData(limit);
            await applyModel(dataset);
        } while (dataset.length >= limit);
    }
    console.log("Finished. Bye bye ...");
    process.exit(0);
}

run();

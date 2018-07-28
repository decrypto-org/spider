let svm = require("./node-svm/lib");
let commandLineArgs = require("command-line-args");
let csvjson = require("csvjson");
let fs = require("fs");
let path = require("path");
let db = require("./models");

// Read input - if we have any: this should be a manually labelled dataset
const commandLineOptions = commandLineArgs([
    {name: "labelled_dataset", alias: "l", type: String, defaultOption: true},
]);

// MODEL variable is instantiated here, in order to save it to disk
// in case of a crash. Every crash handler has access to the model
// and the storeModel function.
let classModel;
let legalModel;

/**
 * Store the currently trained model into model.json file. This is necessary in
 * order to not loose the progress made so far. That way we can train further
 * from run to run
 */
function storeModels () {

}

/**
 * Insert or update labels according to the labels.json config file.
 * This results in up to date label descriptions.
 * @return {Array.<Objects>} Return an array of label sequelize models,
 *                           containing all the labels available. This is
 *                           feasible, since we have only a small number of
 *                           labels.
 */
async function upsertLabels () {

}

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
    pathToLabelledData = path.normalize(commandLineOptions.labelled_dataset);
}

if (pathToLabelledData) {
    let csvData = fs.readFileSync(
        pathToLabelledData,
        {encoding: "utf8"}
    );

    let csvOptions = {
        delimiter: ";",
        quote: "\"",
    };

    labelledData = csvjson.toObject(csvData, csvOptions);
    let labels = []
    for (let i = 0; i < labelledData.length; i++) {
        let label = labelledData.label || "";
        if (label.length <= 0) {
            continue;
        }
        labels.push(label);
    }
    let labels = await db.label.bulkUpsert(labels);
    // labels => labelsByLabel
}

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
        // go ahead and apply model
        // this is only the backbone structure
    });


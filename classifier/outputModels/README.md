In this directory, the trained models will be stored persistently. This ensures that in case of a crash, machine restart or other maintenance downtime, the training process is not lost.

However, if you wish to keep several versions of the models, be sure to back them up before restarting the classifier itself. Renaming is fine.
Note that the models will be always stored into the same file, even if you specify an input model when starting the classifier.
[![Build Status](https://travis-ci.org/decrypto-org/spider.svg?branch=master)](https://travis-ci.org/decrypto-org/spider)
<br>
# Darknet Spider

This is still work in progress and most likely contains one or two bugs. If you find one please report it through the issue tracker. Note that this can also be more undrestood as a framework, which can be used to crawl, process and analyse web data with the ability to apply it to the Tor network. Depending on the proxy used, it can also be run on other networks.

<br>

The Darknet Spider consists of several modules (which are represented by the different subfolders in the project). Below the three most important submodules

## Crawler
The darknet spider is a program that crawls through the Tor network, following links recursively. In its current state it collects each link once and supports different prioritisation modes for the crawling process.
<br>

## Storing the data
The software requires a Postgres DB to be configured to store the collected data for further analysis.

## Analysing the data
The darknet spider contains two additional modules, one for preprocessing the collected data and another one for applying machine learning techniques on the collected and preprocessed material. Within the /classifier, one can include its own algorithms to be applied on the data.


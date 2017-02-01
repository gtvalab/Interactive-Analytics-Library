/**
 * Created by arjun010 on 12/28/15.
 */
(function() {
    ial = {};
    this.ialIdToDataMap = {};
    this.useNormalizedAttributeWeights;
    /*
     * specialAttributeList is an optional list of one or more attributes
     * condition is either 'includeOnly','exclude'
     * */
    ial.init = function(passedData,normalizeAttributeWeights,specialAttributeList,condition) {
        normalizeAttributeWeights = typeof normalizeAttributeWeights !== 'undefined' ? normalizeAttributeWeights : 0;
        specialAttributeList = typeof specialAttributeList !== 'undefined' ? specialAttributeList : [];
        if(specialAttributeList.length>0){
            if(['includeOnly','exclude'].indexOf(condition)==-1){
                throw 'ERROR: condition must be "includeOnly" or "exclude"';
                return ;
            }
        }

        this.attrVector = {};
        this.dataSet = passedData;
        this.clusters = [];
        this.attributeWeightVector = {}; // map of attributes to weights in range [0,1]
        this.ialIdToDataMap  = {}; // map from ialId to actual data item
        this.attributeValueMap = {}; // map from attribute name to its data type and summary statistics about it
        this.activeAttributeCount = 0;
        this.sessionLogs = [];

        this.interactionQueue = [];
        this.attributeWeightVectorQueue = [];
        this.biasLogs = [];
        this.maxQueueSize = 10000;
        this.BIAS_ATTRIBUTE_WEIGHT = 'bias_attribute_weight';
        this.BIAS_VARIANCE = 'bias_variance';
        this.BIAS_SUBSET = 'bias_subset';
        this.BIAS_REPETITION = 'bias_repetition';
        this.BIAS_SCREEN_TIME = 'bias_screen_time';
        // TODO: update this if more metrics are added
        this.BIAS_TYPES = [this.BIAS_ATTRIBUTE_WEIGHT, this.BIAS_VARIANCE, this.BIAS_SUBSET, this.BIAS_REPETITION, this.BIAS_SCREEN_TIME]; 
        this.ATTRIBUTE_SCORES = ['span', 'average', 'min', 'max'];

        // initializing attributeWeightVector and attributeValueMap
        var attributeList = Object.keys(passedData[0]);
        for (var attribute in passedData[0]) {
            var shouldConsiderAttribute = 1;
            if (attribute == "ial");
            else {
                if(specialAttributeList.length>0){
                    if(condition=='includeOnly'){
                        if(specialAttributeList.indexOf(attribute)==-1){ // if specialAttributeList does not contain attribute, exclude
                            shouldConsiderAttribute = -1;
                        }
                    }else if(condition=='exclude'){
                        if(specialAttributeList.indexOf(attribute)>-1){ // if specialAttributeList contains attribute, exclude
                            shouldConsiderAttribute = -1;
                        }
                    }
                }
                if(shouldConsiderAttribute==1){
                    this.activeAttributeCount += 1;
                    this.attributeWeightVector[attribute] = 1.0;
                    var isCategorical = false;
                    var uniqueVals = new Set();
                    for (var index in passedData) {
                        this.dataSet[index]["ial"] = {};
                        this.dataSet[index]["ial"]["id"] = index;
                        this.dataSet[index]["ial"]["weight"] = 1;
                        this.dataSet[index]["ial"]["screen_time"] = 0;
                        this.ialIdToDataMap[index] = this.dataSet[index];

                        if (isNaN(this.dataSet[index][attribute])) {
                            isCategorical = true;
                            break;
                        }
                        uniqueVals.add(this.dataSet[index][attribute]);
                    }

                    // if there are 3 or fewer values, define it as categorical
                    if (uniqueVals.size < 4) isCategorical = true;

                    if (isCategorical) {
                        this.attributeValueMap[attribute] = {
                            'min': passedData[0][attribute],
                            'max': passedData[0][attribute],
                            'mean': passedData[0][attribute],
                            'variance': passedData[0][attribute],
                            'distribution': {},
                            'dataType': 'categorical'
                        };
                    } else {
                        this.attributeValueMap[attribute] = {
                            'min': parseFloat(passedData[0][attribute]),
                            'max': parseFloat(passedData[0][attribute]),
                            'mean': parseFloat(passedData[0][attribute]),
                            'variance': parseFloat(passedData[0][attribute]),
                            'distribution': {},
                            'dataType': 'numeric'
                        };
                    }
                }
            }
        }

        if(normalizeAttributeWeights==1) {
            this.useNormalizedAttributeWeights = 1;
            ial.normalizeAttributeWeightVector();
        } else this.useNormalizedAttributeWeights = 0;

        // find mean, min, and max for all attributes
        for (var attribute in this.attributeValueMap) {
            if (this.attributeValueMap[attribute]['dataType'] == 'numeric') {
                var curMean = 0;
                var curMin = parseFloat(passedData[0][attribute]);
                var curMax = parseFloat(passedData[0][attribute]);
                for (var index in passedData) {
                    var dataItem = passedData[index];
                    var curVal = parseFloat(dataItem[attribute]);
                    if (curVal < curMin) curMin = curVal;
                    if (curVal > curMax) curMax = curVal;
                    curMean += curVal;
                }
                this.attributeValueMap[attribute]['min'] = curMin;
                this.attributeValueMap[attribute]['max'] = curMax;
                this.attributeValueMap[attribute]['mean'] = curMean / passedData.length;
            } else { // categorical
                var curDistribution = {};
                var curMean = passedData[0][attribute];
                var curMin = passedData[0][attribute];
                var curMax = passedData[0][attribute];
                for (var index in passedData) {
                    var dataItem = passedData[index];
                    var curVal = dataItem[attribute];

                    if (curDistribution.hasOwnProperty(curVal)) curDistribution[curVal]++;
                    else curDistribution[curVal] = 1;

                    if (curVal < curMin) curMin = curVal;
                    if (curVal > curMax) curMax = curVal;
                }
                this.attributeValueMap[attribute]['min'] = curMin;
                this.attributeValueMap[attribute]['max'] = curMax;

                this.attributeValueMap[attribute]['distribution'] = curDistribution;
                var keyVals = Object.keys(curDistribution).sort();
                var halfwayPoint = Math.floor(passedData.length / 2);
                var curCount = 0;
                for (var i = 0; i < keyVals.length; i++) {
                    var curKey = keyVals[i];
                    curCount += curDistribution[curKey];
                    if (curCount >= halfwayPoint) {
                        this.attributeValueMap[attribute]['mean'] = curKey;
                        break;
                    }
                }
            }
        }

        // find variance
        for (var attribute in this.attributeValueMap) {
            if (this.attributeValueMap[attribute]['dataType'] == 'numeric') {
                var attrMean = parseFloat(this.attributeValueMap[attribute]['mean']);
                var attrVariance = 0;
                for (var index in passedData) {
                    var dataItem = passedData[index];
                    if (!isNaN(dataItem[attribute])) {
                        var curValue = parseFloat(dataItem[attribute]);
                        var curSqDiff = (curValue - attrMean) * (curValue - attrMean);
                        attrVariance += curSqDiff;
                    } else {
                        attrVariance = dataItem[attribute];
                        break;
                    }
                }
                this.attributeValueMap[attribute]['variance'] = attrVariance / passedData.length;
            } else {
                // will compute entropy for categorical variables instead
                this.attributeValueMap[attribute]['variance'] = computeAttributeVariance(this.dataSet, attribute);
            }
        }

        for(var index in passedData){
            this.dataSet[index]["ial"]["itemScore"] = parseFloat(getItemScore(this.ialIdToDataMap[index],this.attributeWeightVector));
        }
    };

// set the given list of attributes to categorical
    ial.setCategorical = function(attributeList) {
        for (var j = 0; j < attributeList.length; j++) {
            var attribute = attributeList[j];
            this.attributeValueMap[attribute]['dataType'] = 'categorical';

            var curDistribution = {};
            var curMean = this.dataSet[0][attribute];
            var curMin = this.dataSet[0][attribute];
            var curMax = this.dataSet[0][attribute];
            for (var index in this.dataSet) {
                var dataItem = this.dataSet[index];
                var curVal = dataItem[attribute];

                if (curDistribution.hasOwnProperty(curVal)) curDistribution[curVal]++;
                else curDistribution[curVal] = 1;

                if (curVal < curMin) curMin = curVal;
                if (curVal > curMax) curMax = curVal;
            }
            this.attributeValueMap[attribute]['min'] = curMin;
            this.attributeValueMap[attribute]['max'] = curMax;

            this.attributeValueMap[attribute]['distribution'] = curDistribution;
            var keyVals = Object.keys(curDistribution).sort();
            var halfwayPoint = Math.floor(this.dataSet.length / 2);
            var curCount = 0;
            for (var i = 0; i < keyVals.length; i++) {
                var curKey = keyVals[i];
                curCount += curDistribution[curKey];
                if (curCount >= halfwayPoint) {
                    this.attributeValueMap[attribute]['mean'] = curKey;
                    break;
                }
            }

            // will compute entropy for categorical variables instead
            this.attributeValueMap[attribute]['variance'] = computeAttributeVariance(this.dataSet, attribute);
        }
    }

// set the given list of attributes to numerical
    ial.setNumeric = function(attributeList) {
        for (var j = 0; j < attributeList.length; j++) {
            var attribute = attributeList[j];
            this.attributeValueMap[attribute]['dataType'] = 'numeric';
            var curMean = 0;
            var curMin = parseFloat(this.dataSet[0][attribute]);
            var curMax = parseFloat(this.dataSet[0][attribute]);
            for (var index in this.dataSet) {
                var dataItem = this.dataSet[index];
                var curVal = parseFloat(dataItem[attribute]);
                if (curVal < curMin) curMin = curVal;
                if (curVal > curMax) curMax = curVal;
                curMean += curVal;
            }
            curMean /= this.dataSet.length;
            this.attributeValueMap[attribute]['min'] = curMin;
            this.attributeValueMap[attribute]['max'] = curMax;
            this.attributeValueMap[attribute]['mean'] = curMean;

            var normAttrMean = (curMean - curMin) / (curMax - curMin);
            var attrVariance = 0;
            for (var index in this.dataSet) {
                var dataItem = this.dataSet[index];
                if (!isNaN(dataItem[attribute])) {
                    var curValue = parseFloat(dataItem[attribute]);
                    var curNormValue = (curValue - curMin) / (curMax - curMin);
                    var curSqDiff = (curNormValue - normAttrMean) * (curNormValue - normAttrMean);
                    attrVariance += curSqDiff;
                } else {
                    attrVariance = dataItem[attribute];
                    this.attributeValueMap[attribute]['variance'] = attrVariance;
                    break;
                }
            }
            this.attributeValueMap[attribute]['variance'] = attrVariance / this.dataSet.length;
        }
    }

    ial.getAttributeVectorSum = function () {
        var weightSum = 0.0;
        for(var attribute in this.attributeWeightVector){
            weightSum += parseFloat(this.attributeWeightVector[attribute]);
        }
        return weightSum;
    };


    /*
     * computes item score
     * params: data point object, current attribute weight vector
     * */
    function getItemScore(d,attributeVector){
        var score = 0.0;
        for(var attribute in attributeVector){
            if(attributeVector[attribute]>0.0 && !isNaN(d[attribute])){
                var attributeVal = ial.getNormalizedAttributeValue(d[attribute],attribute);
                attributeVal *= attributeVector[attribute];
                score += attributeVal;
            }
        }
        score = parseFloat(Math.round(score* 10000) / 10000).toFixed(4);
        return score;
    }


    /*
     * updates item scores for all data points
     * */
    ial.updateItemScores = function () {
        for(var ialId in this.ialIdToDataMap){
            var d = this.ialIdToDataMap[ialId];
            d.ial.itemScore = parseFloat(getItemScore(d,this.attributeWeightVector));
        }
    };

    /*
     * Normalize weight vector
     * */
    ial.normalizeAttributeWeightVector = function () {
        var activeSum = 0;
        for(var attribute in this.attributeWeightVector){
            if(this.attributeWeightVector[attribute]!=0.0){
                activeSum += this.attributeWeightVector[attribute];
            }
        }
        for(var attribute in this.attributeWeightVector){
            if(this.attributeWeightVector[attribute]!=0.0){
                this.attributeWeightVector[attribute] = this.attributeWeightVector[attribute]/activeSum;
            }
        }
    };

    var inverseNormalizedMap = function(inputMap){
        for(var attribute in inputMap){
            inputMap[attribute] = 1-inputMap[attribute];
        }
        return inputMap;
    };

    var getNormalizedMap = function (inputMap) {
        var activeSum = 0;
        for(var attribute in inputMap){
            activeSum += inputMap[attribute];
        }
        for(var attribute in inputMap){
            inputMap[attribute] = inputMap[attribute]/activeSum;
        }

        return inputMap;
    };


    /*
     * returns the dataset
     * */
    ial.getData = function() {
        return this.dataSet;
    }

    /*
     * sets weight to new value
     * */
    ial.setItemWeight = function (d,newWeight,logEvent,additionalLogInfoMap) {
        logEvent = typeof logEvent !== 'undefined' ? logEvent : false;
        additionalLogInfoMap = typeof additionalLogInfoMap !== 'undefined' ? additionalLogInfoMap : {};

        var logObj = new LogObj(d);
        logObj.setOldWeight(d.ial.weight);
        logObj.setNewWeight(newWeight);
        logObj.setEventName('ItemWeightChange_SET');
        if(additionalLogInfoMap!={}){
            logObj.setCustomLogInfo(additionalLogInfoMap);
        }

        d.ial.weight = newWeight;

        if(logEvent==true){
            this.sessionLogs.push(logObj);
            // track item weight changes in interactionQueue
            ial.interactionEnqueue(logObj);
        }
    };

    /*
     * increments weight by increment value
     * */
    ial.incrementItemWeight = function (d,increment,logEvent,additionalLogInfoMap) {
        logEvent = typeof logEvent !== 'undefined' ? logEvent : false;
        additionalLogInfoMap = typeof additionalLogInfoMap !== 'undefined' ? additionalLogInfoMap : {};

        var logObj = new LogObj(d);
        logObj.setOldWeight(d.ial.weight);
        logObj.setEventName('ItemWeightChange_UPDATE');

        d.ial.weight += increment;

        logObj.setNewWeight(d.ial.weight);
        if(additionalLogInfoMap!={}){
            logObj.setCustomLogInfo(additionalLogInfoMap);
        }

        if(logEvent==true){
            this.sessionLogs.push(logObj);
            // track item weight changes in interactionQueue
            ial.interactionEnqueue(logObj);
        }
        //console.log(logObj)
    };

// returns the current attributeValueMap
    ial.getAttributeValueMap = function(){
        return ial.utils.clone(this.attributeValueMap);
    };

    /*
    * Function to delete an item from all computations.
    * Given a dataItem object, removes the corresponding item from both the this.dataSet (list) and the this.ialIdToDataMap (hashmap)
    * */
    ial.deleteItem = function (dataItem) {
        var idToDelete = dataItem.ial.id;
        var indexToDelete = -1;
        for(var i in this.dataSet){
            var d = this.dataSet[i];
            var curId = d.ial.id;
            if(idToDelete==curId){
                indexToDelete=i;
                break;
            }
        }
        if(indexToDelete!=-1){
            this.dataSet.splice(indexToDelete,1);
            delete this.ialIdToDataMap[idToDelete];
        }
    };

    ial.addData = function (dataPoints) {
    	dataPoints.forEach(function(dataPoint) {
            var newId = parseInt(this.dataSet[this.dataSet.length-1].ial.id);
            while(newId in this.ialIdToDataMap){
                newId += 1;
            }

            dataPoint['ial'] = {};
            dataPoint['ial']['id'] = newId;
            dataPoint['ial']['weight'] = 1;
            dataPoint['ial']['itemScore'] = parseFloat(getItemScore(dataPoint,this.attributeWeightVector));

            this.ialIdToDataMap[newId] = dataPoint;
            this.dataSet.push(dataPoint);
        });
    };

    /*
     * returns normalized value in [0,1] given an attribute's current value and name
     * ref: http://stackoverflow.com/questions/5294955/how-to-scale-down-a-range-of-numbers-with-a-known-min-and-max-value
     * */
    ial.getNormalizedAttributeValue = function(val,attribute) {
        if (this.attributeValueMap[attribute]['dataType'] != 'categorical') {
            var a = 0, b = 1;
            var min = this.attributeValueMap[attribute]['min'];
            var max = this.attributeValueMap[attribute]['max'];

            var normalizedValue;
            normalizedValue = ((b - a) * (val - min) / (max - min)) + a;
            return normalizedValue;
        } else { return val; }
    };

    /*
     * returns current attributeWeightVector
     * */
    ial.getAttributeWeightVector = function(){
        return ial.utils.clone(this.attributeWeightVector);
    };

    ial.getIalIdToDataMap = function () {
        return this.ialIdToDataMap;
    };

    /*
     * returns requested attribute's weight
     * */
    ial.getAttributeWeight = function (attribute) {
        if (attribute in this.attributeWeightVector){
            return this.attributeWeightVector[attribute];
        }else{
            throw "Attribute not available or not specifed in weight vector during initialization."
        }
    };


    /*
     * sets attribute's weight to newWeight. Checks to ensure that the weight is always in [0.0,1.0]
     * */
    ial.setAttributeWeight = function(attribute,newWeight,logEvent,additionalLogInfoMap){

        logEvent = typeof logEvent !== 'undefined' ? logEvent : false;
        additionalLogInfoMap = typeof additionalLogInfoMap !== 'undefined' ? additionalLogInfoMap : {};

        var logObj = new LogObj(attribute);
        logObj.setOldWeight(this.attributeWeightVector[attribute]);
        logObj.setEventName('AttributeWeightChange_SET');

        if(this.useNormalizedAttributeWeights==0) {
            if (newWeight > 1.0) {
                this.attributeWeightVector[attribute] = 1.0;
            } else if (newWeight < 0.0) {
                this.attributeWeightVector[attribute] = 0.0;
            } else {
                this.attributeWeightVector[attribute] = newWeight;
            }
        }else{
            this.attributeWeightVector[attribute] = newWeight;
            ial.normalizeAttributeWeightVector();
        }
        ial.updateActiveAttributeCount();

        if(additionalLogInfoMap!={}){
            logObj.setCustomLogInfo(additionalLogInfoMap);
        }

        logObj.setNewWeight(this.attributeWeightVector[attribute]);

        if(logEvent==true){
            this.sessionLogs.push(logObj);
            // track attribute weight changes in attributeWeightVectorQueue
            ial.attributeWeightVectorEnqueue(logObj);
        }

        ial.updateItemScores();
    };

    /*
     * Increments attribute's weight by increment. Checks to ensure that the weight is always in [0.0,1.0]
     * */
    ial.incrementAttributeWeight = function(attribute,increment,logEvent,additionalLogInfoMap){
        logEvent = typeof logEvent !== 'undefined' ? logEvent : false;
        additionalLogInfoMap = typeof additionalLogInfoMap !== 'undefined' ? additionalLogInfoMap : {};

        var logObj = new LogObj(attribute);
        logObj.setOldWeight(this.attributeWeightVector[attribute]);
        logObj.setEventName('AttributeWeightChange_UPDATE');

        var newWeight = this.attributeWeightVector[attribute] + increment;

        if(this.useNormalizedAttributeWeights==0) {
            console.log("if");
            if (newWeight > 1.0) {
                this.attributeWeightVector[attribute] = 1.0;
            } else if (newWeight < 0.0) {
                this.attributeWeightVector[attribute] = 0.0;
            } else {
                this.attributeWeightVector[attribute] = newWeight;
            }
        }else{
            this.attributeWeightVector[attribute] = newWeight;
            ial.normalizeAttributeWeightVector();
        }
        ial.updateActiveAttributeCount();


        if(additionalLogInfoMap!={}){
            logObj.setCustomLogInfo(additionalLogInfoMap);
        }

        logObj.setNewWeight(this.attributeWeightVector[attribute]);

        if(logEvent==true){
            this.sessionLogs.push(logObj);
            // track attribute weight changes in attributeWeightVectorQueue
            ial.attributeWeightVectorEnqueue(logObj);
        }

        ial.updateItemScores();
    };

    /*
     * Sets the attribute weight vector to the newly passed map
     * */
    ial.setAttributeWeightVector = function(newAttributeWeightVector,logEvent,additionalLogInfoMap){
        logEvent = typeof logEvent !== 'undefined' ? logEvent : false;
        additionalLogInfoMap = typeof additionalLogInfoMap !== 'undefined' ? additionalLogInfoMap : {};

        var logObj = new LogObj(ial.utils.clone(this.attributeWeightVector));
        logObj.setOldWeight(ial.utils.clone(this.attributeWeightVector));
        logObj.setEventName('AttributeWeightChange_SETALL');

        this.attributeWeightVector = ial.utils.clone(newAttributeWeightVector);
        for(var attribute in this.attributeWeightVector){
            if(this.attributeWeightVector[attribute]>1.0){
                this.attributeWeightVector[attribute] = 1.0
            }
            if(this.attributeWeightVector[attribute]<0.0){
                this.attributeWeightVector[attribute] = 0.0
            }
        }

        logObj.setNewWeight(ial.utils.clone(this.attributeWeightVector));
        if(additionalLogInfoMap!={}){
            logObj.setCustomLogInfo(additionalLogInfoMap);
        }

        if(logEvent==true){
            this.sessionLogs.push(logObj);
            // track attribute weight changes in attributeWeightVectorQueue
            ial.attributeWeightVectorEnqueue(logObj);
        }

        if(this.useNormalizedAttributeWeights==1){
            ial.normalizeAttributeWeightVector();
        }

        ial.updateItemScores();
    };


    /*
     * Private function to update active attribute counts based on attribute weight vector
     * */
    ial.updateActiveAttributeCount = function () {
        this.activeAttributeCount = 0;
        for(var attribute in this.attributeWeightVector){
            if(this.attributeWeightVector[attribute]>0.0){
                this.activeAttributeCount += 1;
            }
        }
    };

    /*
     * resets the attributeWeightVector to have all 1.0s
     * */
    ial.resetAttributeWeightVector = function (logEvent,additionalLogInfoMap) {
        logEvent = typeof logEvent !== 'undefined' ? logEvent : false;
        additionalLogInfoMap = typeof additionalLogInfoMap !== 'undefined' ? additionalLogInfoMap : {};

        var logObj = new LogObj(ial.utils.clone(ial.printAttributeWeightVectorQueue));
        logObj.setOldWeight(ial.utils.clone(this.attributeWeightVector));
        logObj.setEventName('AttributeWeightChange_RESET');

        for(var attribute in this.attributeWeightVector){
            this.attributeWeightVector[attribute] = 1.0;
        }


        if(additionalLogInfoMap!={}){
            logObj.setCustomLogInfo(additionalLogInfoMap);
        }

        logObj.setNewWeight(ial.utils.clone(this.attributeWeightVector));

        if(logEvent==true){
            this.sessionLogs.push(logObj);
            // track attribute weight changes in attributeWeightVectorQueue
            ial.attributeWeightVectorEnqueue(logObj);
        }
        ial.updateActiveAttributeCount();

        if(this.useNormalizedAttributeWeights==1){
            ial.normalizeAttributeWeightVector();
        }

        ial.updateItemScores();
    };

    /*
     * Nullifies attributeWeightVector to 0.0s
     * */
    ial.nullifyAttributeWeightVector = function (logEvent, additionalLogInfoMap) {

        logEvent = typeof logEvent !== 'undefined' ? logEvent : false;
        additionalLogInfoMap = typeof additionalLogInfoMap !== 'undefined' ? additionalLogInfoMap : {};

        var logObj = new LogObj(ial.utils.clone(this.attributeWeightVector));
        logObj.setOldWeight(ial.utils.clone(this.attributeWeightVector));
        logObj.setEventName('AttributeWeightChange_NULLIFY');

        for(var attribute in this.attributeWeightVector){
            this.attributeWeightVector[attribute] = 0.0;
        }

        logObj.setNewWeight(ial.utils.clone(this.attributeWeightVector));
        if(additionalLogInfoMap!={}){
            logObj.setCustomLogInfo(additionalLogInfoMap);
        }

        if(logEvent==true){
            this.sessionLogs.push(logObj);
            // track attribute weight changes in attributeWeightVectorQueue
            ial.attributeWeightVectorEnqueue(logObj);
        }

        ial.updateActiveAttributeCount();
        ial.updateItemScores();
    };

    /*
     * Nullifies attributeWeightVector to 0.0s
     * */
    ial.nullifyAttributeWeights = function (attributes, logEvent, additionalLogInfoMap) {

        logEvent = typeof logEvent !== 'undefined' ? logEvent : false;
        additionalLogInfoMap = typeof additionalLogInfoMap !== 'undefined' ? additionalLogInfoMap : {};

        var logObj = new LogObj(ial.utils.clone(this.attributeWeightVector));
        logObj.setOldWeight(ial.utils.clone(this.attributeWeightVector));
        logObj.setEventName('AttributeWeightChange_NULLIFY');

        for(var i = 0; i < attributes.length; i++){
            ial.setAttributeWeight(attributes[i], 0.0);
        }

        logObj.setNewWeight(ial.utils.clone(this.attributeWeightVector));
        if(additionalLogInfoMap!={}){
            logObj.setCustomLogInfo(additionalLogInfoMap);
        }

        if(logEvent==true){
            this.sessionLogs.push(logObj);
            // track attribute weight changes in attributeWeightVectorQueue
            ial.attributeWeightVectorEnqueue(logObj);
        }

        ial.updateActiveAttributeCount();
        ial.updateItemScores();
    };

    /*
     * Returns top N points based on interaction weight (a.k.a. weight)
     * */
    ial.getTopNPointsByInteractionWeights = function (N,logEvent,additionalLogInfoMap) {
        N = typeof N !== 'undefined' ? N : 1;
        logEvent = typeof logEvent !== 'undefined' ? logEvent : false;
        additionalLogInfoMap = typeof additionalLogInfoMap !== 'undefined' ? additionalLogInfoMap : {};

        var logObj = new LogObj();
        logObj.setOldWeight('');
        logObj.setEventName('GetTopN_ByInteractionWeight');


        var list = this.dataSet.slice(0);
        sortObj(list, 'ial.weight', 'd');

        logObj.setNewWeight('');
        if(additionalLogInfoMap!={}){
            logObj.setCustomLogInfo(additionalLogInfoMap);
        }
        logObj.setEventSpecificInfo({'dataReturned':list.slice(0,N),'N':N});
        if(logEvent==true){
            this.sessionLogs.push(logObj);
        }

        return list.slice(0,N);
    };

    /*
     * Returns top N points based on interaction weight (a.k.a. weight)
     * */
    ial.getTopNPointsByScores = function (N,logEvent,additionalLogInfoMap) {
        N = typeof N !== 'undefined' ? N : 1;
        logEvent = typeof logEvent !== 'undefined' ? logEvent : false;
        additionalLogInfoMap = typeof additionalLogInfoMap !== 'undefined' ? additionalLogInfoMap : {};

        var logObj = new LogObj();
        logObj.setOldWeight('');
        logObj.setEventName('GetTopN_ByScore');


        var list = this.dataSet.slice(0);
        sortObj(list, 'ial.itemScore', 'd');

        var topNPoints = list.slice(0,N);
        logObj.setNewWeight('');
        if(additionalLogInfoMap!={}){
            logObj.setCustomLogInfo(additionalLogInfoMap);
        }
        logObj.setEventSpecificInfo({'dataReturned':topNPoints,'N':N});
        if(logEvent==true){
            this.sessionLogs.push(logObj);
        }

        return topNPoints;
    };


    /*
     * return an array of the n most similar points to the given data point
     */
    ial.getNSimilarPoints = function(dataPoint, n,logEvent,additionalLogInfoMap) {

        logEvent = typeof logEvent !== 'undefined' ? logEvent : false;
        additionalLogInfoMap = typeof additionalLogInfoMap !== 'undefined' ? additionalLogInfoMap : {};

        var logObj = new LogObj(dataPoint);
        logObj.setOldWeight(dataPoint.ial.weight);
        logObj.setEventName('GetSimilarPoints');

        var id = dataPoint.ial.id;

        // locate the given point
        var dataPt;
        if (id in this.ialIdToDataMap) {
            dataPt = this.ialIdToDataMap[id];
        } else { return []; }

        var allPts = [];
        var similarPts = [];

        for (var i in this.dataSet) {
            // don't care to get the similarity with itself
            if (this.dataSet[i]["ial"]["id"] != id) {
                var similarityScore = ial.getSimilarityScore(dataPt, this.dataSet[i]);
                if (similarityScore != -1) {
                    var newPt = { "data" : this.dataSet[i], "similarity" : similarityScore };
                    allPts.push(newPt);
                } else
                    console.log("GetNSimilarPoints: Score of -1 between id " + id + " and id " + this.dataSet[i]["ial"]["id"]);
            }
        }

        allPts.sort(function(a, b) {
            return a["similarity"] - b["similarity"];
        });

        for (var i = 0; i < n; i++)
            similarPts.push(allPts[i]["data"]);

        logObj.setNewWeight(dataPoint.ial.weight);
        if(additionalLogInfoMap!={}){
            logObj.setCustomLogInfo(additionalLogInfoMap);
        }
        if(logEvent==true){
            this.sessionLogs.push(logObj);
        }

        return similarPts;
    };

    /*
     * get the similarity score of the two given items
     * lower value indicates more similar
     */
    ial.getSimilarityScore = function(dataPoint1, dataPoint2) {
        var id1 = dataPoint1.ial.id;
        var id2 = dataPoint2.ial.id;
        // locate the given points
        var dataPt1, dataPt2;

        if ((id1 in this.ialIdToDataMap) && (id2 in this.ialIdToDataMap)) {
            dataPt1 = this.ialIdToDataMap[id1];
            dataPt2 = this.ialIdToDataMap[id2];
        } else { return -1; }

        simScore = 0;
        for (var attribute in this.attributeWeightVector) {
            var currentAttrWeight = this.attributeWeightVector[attribute];
            simScore += ((currentAttrWeight * 1.0 / this.activeAttributeCount) * ial.getNormalizedDistanceByAttribute(dataPt1, dataPt2, attribute));
        }

        if (simScore > 1 || simScore < 0) { console.log("GetSimilarityScore: invalid score " + simScore); }
        return simScore;
    };


    /* get the normalized distance between the two items with the given ids for the given attribute */
    ial.getNormalizedDistanceByAttribute = function(dataPoint1, dataPoint2, attribute) {
        var id1 = dataPoint1.ial.id;
        var id2 = dataPoint2.ial.id;

        // locate the given points
        var dataPt1, dataPt2;

        if ((id1 in this.ialIdToDataMap) && (id2 in this.ialIdToDataMap)) {
            dataPt1 = this.ialIdToDataMap[id1];
            dataPt2 = this.ialIdToDataMap[id2];
        } else { return -1; }

        var attrVal1, attrVal2;

        if (this.attributeValueMap[attribute]['dataType'] == 'categorical') {
            attrVal1 = ial.getNormalizedAttributeValue(dataPt1[attribute],attribute);
            attrVal2 = ial.getNormalizedAttributeValue(dataPt2[attribute],attribute);
            if (attrVal1 == attrVal2) // attributes are the same, distance = 0
                return 0;
            else // attributes are different, distance = 1
                return 1;
        } else { // numerical
            attrVal1 = ial.getNormalizedAttributeValue(parseFloat(dataPt1[attribute]),attribute);
            attrVal2 = ial.getNormalizedAttributeValue(parseFloat(dataPt2[attribute]),attribute);
            var attrRange = [ial.attributeValueMap[attribute]['min'], ial.attributeValueMap[attribute]['max']];
            return Math.abs((attrVal1) - (attrVal2)) / (attrRange[1] - attrRange[0]);
        }
    };

    /*
     * Returns a copy of the session logs collected so far
     * */
    ial.getSessionLogs = function(){
        return this.sessionLogs.slice(0);
    };

    /*
     * Returns the subset of logs which involve data items.
     * */
    ial.getDataItemLogs = function(){
        var dataItemLogList = [];
        for(var i in this.sessionLogs){
            var logObj = this.sessionLogs[i];
            if(logObj.eventName.indexOf('ItemWeightChange')>-1){
                dataItemLogList.push(logObj);
            }
        }

        return dataItemLogList;
    };


    /*
     * Returns the subset of logs which involve attributes.
     * */
    ial.getAttributeLogs = function () {
        var dataItemLogList = [];
        for(var i in this.sessionLogs){
            var logObj = this.sessionLogs[i];
            if(logObj.eventName.indexOf('AttributeWeightChange')>-1){
                dataItemLogList.push(logObj);
            }
        }
        return dataItemLogList;
    };


    function getVariance(arr) {

        function getVariance(arr, mean) {
            return arr.reduce(function(pre, cur) {
                pre = pre + Math.pow((cur - mean), 2);
                return pre;
            }, 0)
        }

        var meanTot = arr.reduce(function(pre, cur) {
            return pre + cur;
        })
        var total = getVariance(arr, meanTot / arr.length);

        var res = {
            mean: meanTot / arr.length,
            variance: total / arr.length
        }

        return res.variance;

        //return ["Mean:",
        //    res.mean,
        //    "Variance:",
        //    res.variance
        //].join(' ');
    }


    /*
     * Returns an attribute weight vector generated based on similarity between given points
     * */
    ial.generateAttributeWeightVectorUsingSimilarity = function (points) {

        // returns 1-result since goal is to find similarity
        var getNormalizedAttributeWeightByVariance = function(variance,minVariance,maxVariance) {
            var a = 0.0, b = 1.0;
            var min = minVariance;
            var max = maxVariance;

            var normalizedValue = 1-(((b - a) * (variance - min) / (max - min)) + a);

            return normalizedValue;
        };


        var tempAttributeWeightVector = {};
        var attributeValueListMap = {};


        // creating a map with all values as lists against attributes (first step)
        for(var i in points){
            var d = points[i];
            for(var attribute in this.attributeWeightVector){
                var val = this.getNormalizedAttributeValue(d[attribute],attribute);
                if( attribute in attributeValueListMap){
                    attributeValueListMap[attribute].push(val);
                }else{
                    attributeValueListMap[attribute] = [];
                    attributeValueListMap[attribute].push(val);
                }
            }
        }
        console.log(attributeValueListMap)

        // setting weights as variances (intermediate step)
        var minVariance = Number.MAX_VALUE,maxVariance = Number.MIN_VALUE;
        for(var attribute in this.attributeWeightVector){
            //console.log("==================")
            if(this.attributeValueMap[attribute]['dataType']!='categorical') {
                tempAttributeWeightVector[attribute] = getVariance(attributeValueListMap[attribute]);
                if(tempAttributeWeightVector[attribute]<minVariance){
                    minVariance = tempAttributeWeightVector[attribute];
                }
                if(tempAttributeWeightVector[attribute]>maxVariance){
                    maxVariance = tempAttributeWeightVector[attribute];
                }
            }else{
                var uniqueVals = getUniqueList(attributeValueListMap[attribute]);
                if(uniqueVals.length>1){
                    tempAttributeWeightVector[attribute] = 0;
                }else{
                    tempAttributeWeightVector[attribute] = 1;
                }
            }
        }
        console.log(ial.utils.clone(tempAttributeWeightVector));
        //console.log(minVariance,maxVariance);

        // setting weights as normalized values between 0 -1 based on variances (final step)
        for(var attribute in this.attributeWeightVector) {
            if (this.attributeValueMap[attribute]['dataType'] != 'categorical') {
                var normalizedAttributeWeight = getNormalizedAttributeWeightByVariance(tempAttributeWeightVector[attribute],minVariance,maxVariance);
                tempAttributeWeightVector[attribute] = normalizedAttributeWeight;
            }
        }

        if(this.useNormalizedAttributeWeights==1){
            tempAttributeWeightVector = getNormalizedMap(tempAttributeWeightVector);
        }

        return tempAttributeWeightVector;
    };



    function getUniqueList(arr){
        var uniqueList = [];
        for(var i in arr){
            if(uniqueList.indexOf(arr[i])==-1){
                uniqueList.push(arr[i]);
            }
        }
        return uniqueList;
    }

    /*
     * Returns an attribute weight vector generated based on difference between given points
     * */
    ial.generateAttributeWeightVectorUsingDifferences = function (points1, points2) {
        var tempAttributeWeightVector = {};
        if (typeof points2 !== 'undefined' && points2.length>0) {
            var points1Avg = {}, points2Avg = {};
            var points1Len = points1.length, points2Len = points2.length;
            var points1CatMap = {}, points2CatMap = {};

            // sum all the attribute values in points1
            for(var i in points1){
                var d = points1[i];
                for(var attribute in this.attributeWeightVector){
                    if(this.attributeValueMap[attribute]['dataType']!='categorical'){
                        var val = this.getNormalizedAttributeValue(d[attribute],attribute);
                        if(points1Avg.hasOwnProperty(attribute)) {
                            points1Avg[attribute] += val;
                        } else{
                            points1Avg[attribute] = val;
                        }
                    } else{
                        var val = this.getNormalizedAttributeValue(d[attribute],attribute);
                        if(points1CatMap.hasOwnProperty(attribute)){
                            if(points1CatMap[attribute].hasOwnProperty(val)){
                                points1CatMap[attribute][val]++;
                            } else{
                                points1CatMap[attribute][val] = 1;
                            }
                        } else{
                            points1CatMap[attribute] = {};
                            points1CatMap[attribute][val] = 1;
                            points1Avg[attribute] = val;
                        }
                    }
                }
            }

            // compute the average for each attribute in points1
            for(var attribute in points1Avg){
                if(this.attributeValueMap[attribute]['dataType']!='categorical'){
                    points1Avg[attribute] = points1Avg[attribute] / points1Len;
                } else{
                    var catMax = Math.MIN_VALUE;
                    var catMaxVal = points1Avg[attribute];
                    for(var attributeVal in points1CatMap[attribute]){
                        if(points1CatMap[attribute][attributeVal] > catMax){
                            catMax = points1CatMap[attribute][attributeVal];
                            catMaxVal = attributeVal;
                        }
                    }
                    points1Avg[attribute] = catMaxVal;
                }
            }

            // sum all the attribute values in points2
            for(var i in points2){
                var d = points2[i];
                for(var attribute in this.attributeWeightVector){
                    if(this.attributeValueMap[attribute]['dataType']!='categorical'){
                        var val = this.getNormalizedAttributeValue(d[attribute],attribute);
                        if(points2Avg.hasOwnProperty(attribute)) {
                            points2Avg[attribute] += val;
                        } else{
                            points2Avg[attribute] = val;
                        }
                    } else{
                        var val = this.getNormalizedAttributeValue(d[attribute],attribute);
                        if(points2CatMap.hasOwnProperty(attribute)){
                            if(points2CatMap[attribute].hasOwnProperty(val)){
                                points2CatMap[attribute][val]++;
                            } else{
                                points2CatMap[attribute][val] = 1;
                            }
                        } else{
                            points2CatMap[attribute] = {};
                            points2CatMap[attribute][val] = 1;
                            points2Avg[attribute] = val;
                        }
                    }
                }
            }

            // compute the average for each attribute in points2
            for(var attribute in points2Avg){
                if(this.attributeValueMap[attribute]['dataType']!='categorical'){
                    points2Avg[attribute] = points2Avg[attribute] / points2Len;
                } else{
                    var catMax = Math.MIN_VALUE;
                    var catMaxVal = points2Avg[attribute];
                    for(var attributeVal in points2CatMap[attribute]){
                        if(points2CatMap[attribute][attributeVal] > catMax){
                            catMax = points2CatMap[attribute][attributeVal];
                            catMaxVal = attributeVal;
                        }
                    }
                    points2Avg[attribute] = catMaxVal;
                }
            }

            var difference = {};
            for(var attribute in points1Avg){
                if(points2Avg.hasOwnProperty(attribute)){
                    if(this.attributeValueMap[attribute]['dataType']!='categorical'){
                        difference[attribute] = points1Avg[attribute] - points2Avg[attribute];
                    }else {
                        if(points1Avg[attribute] == points2Avg[attribute]){
                            difference[attribute] = 0;
                        }else{
                            difference[attribute] = 1;
                        }
                    }
                }
            }

            tempAttributeWeightVector = difference;

        } else {
            /*
            // returns result directly since goal is to find similarity
            var getNormalizedAttributeWeightByVariance = function(variance,minVariance,maxVariance) {
                var a = 0.0, b = 1.0;
                var min = minVariance;
                var max = maxVariance;

                var normalizedValue = (((b - a) * (variance - min) / (max - min)) + a);

                return normalizedValue;
            };


            var tempAttributeWeightVector = {};
            var attributeValueListMap = {};


            // creating a map with all values as lists against attributes (first step)
            for(var i in points1){
                var d = points1[i];
                for(var attribute in this.attributeWeightVector){
                    var val = this.getNormalizedAttributeValue(d[attribute],attribute);
                    if( attribute in attributeValueListMap){
                        attributeValueListMap[attribute].push(val);
                    }else{
                        attributeValueListMap[attribute] = [];
                        attributeValueListMap[attribute].push(val);
                    }
                }
            }

            // setting weights as variances (intermediate step)
            var minVariance = Number.MAX_VALUE,maxVariance = Number.MIN_VALUE;
            for(var attribute in this.attributeWeightVector){
                //console.log("==================")
                if(this.attributeValueMap[attribute]['dataType']!='categorical') {
                    tempAttributeWeightVector[attribute] = getVariance(attributeValueListMap[attribute]);
                    if(tempAttributeWeightVector[attribute]<minVariance){
                        minVariance = tempAttributeWeightVector[attribute];
                    }
                    if(tempAttributeWeightVector[attribute]>maxVariance){
                        maxVariance = tempAttributeWeightVector[attribute];
                    }
                }else{
                    var uniqueVals = getUniqueList(attributeValueListMap[attribute]);
                    if(uniqueVals.length>1){
                        tempAttributeWeightVector[attribute] = 1;
                    }else{
                        tempAttributeWeightVector[attribute] = 0;
                    }
                }
            }
            //console.log(ial.utils.clone(tempAttributeWeightVector));
            //console.log(minVariance,maxVariance);

            // setting weights as normalized values between 0 -1 based on variances (final step)
            for(var attribute in this.attributeWeightVector) {
                if (this.attributeValueMap[attribute]['dataType'] != 'categorical') {
                    var normalizedAttributeWeight = getNormalizedAttributeWeightByVariance(tempAttributeWeightVector[attribute],minVariance,maxVariance);

                    tempAttributeWeightVector[attribute] = normalizedAttributeWeight;
                }
            }

            if(this.useNormalizedAttributeWeights==1){
                tempAttributeWeightVector = getNormalizedMap(tempAttributeWeightVector);
            }
            */

            tempAttributeWeightVector = ial.generateAttributeWeightVectorUsingSimilarity(points1);


            //---------------------------
            // old difference based logic
            //---------------------------
            /*
             for(var attribute in this.attributeWeightVector){
             var val1 = this.getNormalizedAttributeValue(points[0][attribute],attribute);
             var val2 = this.getNormalizedAttributeValue(points[1][attribute],attribute);
             if(this.attributeValueMap[attribute]['dataType']!='categorical'){
             var diff = Math.abs(val1-val2);
             tempAttributeWeightVector[attribute] = diff;
             }else{
             if(val1 == val2){
             tempAttributeWeightVector[attribute] = 0.0;
             }else{
             tempAttributeWeightVector[attribute] = 1.0;
             }
             }
             }
             */
        }

        return tempAttributeWeightVector;
    };

    /*
     * --------------------
     *         KNN
     * --------------------
     * */

    ial.createClusters = function(dataItems, knnDistance) {
        dataItems = typeof dataItems !== 'undefined' ? dataItems : this.dataSet;
        knnDistance = typeof knnDistance !== 'undefined' ? knnDistance : 0.05;
        this.clusters = this.classify(dataItems, knnDistance);
        return this.clusters;
    };

    ial.classify = function(dataPoints, knnDistance) {
        var aggregateScores = [];

        var tempStringId = 10,
            tempStringValMap = {};

        /* Use the attribute weight vector for these computations. */
        for (var index in dataPoints) {
            aggregateScores[index] = {};
            aggregateScores[index]["ial"] = {};
            aggregateScores[index]["ial"]["id"] = dataPoints[index]["ial"]["id"];
            aggregateScores[index]["ial"]["aggregateScore"] = 0;
            for (var attributeName in this.attributeWeightVector) {
                var attributeValue = ial.getNormalizedAttributeValue(dataPoints[index][attributeName],attributeName);
                var attributeWeight = this.attributeWeightVector[attributeName];

                if(attributeName!='ial'){
                    if(this.attributeValueMap[attributeName]['dataType']=='categorical'){
                        if (Object.keys(tempStringValMap).indexOf(attributeValue) == -1) { // if string not found in tempStringValMap i.e. is a new category string
                            tempStringValMap[attributeValue] = tempStringId;
                            attributeValue = tempStringId;
                            tempStringId += 10;
                        } else {
                            attributeValue = tempStringValMap[attributeValue];
                        }
                        aggregateScores[index]["ial"]["aggregateScore"] += attributeValue * attributeWeight;
                    }else{
                        aggregateScores[index]["ial"]["aggregateScore"] += attributeValue * attributeWeight;
                    }
                }
                //
                //if (isNaN(attributeValue) && attributeName!='ial') {
                //    if (Object.keys(tempStringValMap).indexOf(attributeValue) == -1) { // if string not found
                //        tempStringValMap[attributeValue] = tempStringId;
                //        attributeValue = tempStringId;
                //        tempStringId += 10;
                //    } else {
                //        attributeValue = tempStringValMap[attributeValue];
                //    }
                //}
                //
                //if (attributeName != "ial" && isNaN(attributeValue) == false && attributeWeight>0.0) {
                //    //attributeValue = ial.getNormalizedAttributeValue(attributeValue,attributeName); // Using normalized attribute values for computation
                //    aggregateScores[index]["ial"]["aggregateScore"] += attributeValue * attributeWeight;
                //}

            }
            aggregateScores[index]["ial"]["aggregateScore"] *= dataPoints[index]["ial"]["weight"];
        }

        aggregateScores.sort(function(a, b) {
            return b["ial"]["aggregateScore"] - a["ial"]["aggregateScore"];
        });

        var clusters = [];
        var clusterIndex = -1;
        for (var index in aggregateScores) {
            if (clusters.length == 0) {
                clusterIndex += 1;
                var cluster = new Cluster(clusterIndex);
                var curDataObj = ial.ialIdToDataMap[aggregateScores[index]["ial"]["id"]];
                curDataObj.ial.KNNClusterId = cluster.getClusterId();
                cluster.addDataItem(curDataObj);
                clusters.push(cluster);
            } else {
                var previousObject = aggregateScores[index - 1];
                var currentObject = aggregateScores[index];

                if (Math.abs(currentObject["ial"]["aggregateScore"] - previousObject["ial"]["aggregateScore"]) <= knnDistance) {
                    var curDataObj = this.ialIdToDataMap[currentObject["ial"]['id']];
                    curDataObj.ial.KNNClusterId = cluster.getClusterId();
                    cluster.addDataItem(curDataObj);
                } else {
                    clusterIndex += 1;
                    var cluster = new Cluster(clusterIndex);
                    var curDataObj = this.ialIdToDataMap[aggregateScores[index]["ial"]['id']];
                    curDataObj.ial.KNNClusterId = cluster.getClusterId();
                    cluster.addDataItem(curDataObj);
                    clusters.push(cluster);
                }
            }
        }
        return clusters;
    };

    /*
     * Cluster data structure
     * */

    var Cluster = function(id) {
        this.clusterId = id;
        this.clusterLabel = "";
        this.dataItems = [];
    };

    Cluster.prototype.getClusterId = function() {
        return this.clusterId;
    };

    Cluster.prototype.setClusterLabel = function(label) {
        this.clusterLabel = label;
    };

    Cluster.prototype.getClusterLabel = function() {
        return this.clusterLabel;
    };

    Cluster.prototype.addDataItem = function(dataItemOrId) { //TO-DO: handle ids and objects
        this.dataItems.push(dataItemOrId);
    };

    Cluster.prototype.removeDataItem = function(dataItemOrId) { //TO-DO: handle ids and objects
        this.dataItems.push(dataItemOrId);
    };

    Cluster.prototype.getClusterDataItems = function() {
        return this.dataItems;
    };



    /*
     * Log object data structure
     * */

    var LogObj = function (d,tStamp) {
        d = typeof d !== 'undefined' ? d : '';

        this.dataItem = d;
        this.eventName = '';
        this.oldWeight = '';
        this.newWeight = '';
        this.customLogInfo = {};
        this.eventSpecificInfo = {};

        tStamp = typeof tStamp !== 'undefined' ? tStamp : new Date();

        this.eventTimeStamp = tStamp;
    };

    LogObj.prototype.setEventSpecificInfo = function(eventInfoMap) {
        this.eventSpecificInfo = eventInfoMap;
    };

    LogObj.prototype.setNewWeight = function(weight) {
        this.newWeight = weight;
    };

    LogObj.prototype.setOldWeight = function(weight) {
        this.oldWeight = weight;
    };

    LogObj.prototype.setEventName = function(ev) {
        this.eventName = ev;
    };

    LogObj.prototype.setCustomLogInfo = function(customLogInfoMap) {
        this.customLogInfo = ial.utils.clone(customLogInfoMap);
    };



    /*
     * Interaction and attribute weight vector queue utilities
     * */

    ial.setMaxQueueSize = function(newQueueSize) {
        this.maxQueueSize = newQueueSize; 
    }

    ial.getInteractionQueue = function() {
        return this.interactionQueue;
    }

// print the contents of the interaction queue
    ial.printInteractionQueue = function() {
        console.log("Printing Interaction Queue (" + this.interactionQueue.length + "): ");
        for (var i in this.interactionQueue) console.log(this.interactionQueue[i]);
    }

    ial.interactionEnqueue = function(obj) {
        if (typeof obj === 'undefined' || obj == null) return;

        if (this.interactionQueue.length >= this.maxQueueSize) {
            console.log("Max queue size reached");
            ial.interactionDequeue();
        }
        this.interactionQueue.push(obj);
    }

    ial.interactionDequeue = function() {
        return this.interactionQueue.shift(); 
    }

    ial.getAttributeWeightVectorQueue = function() {
        return this.attributeWeightVectorQueue;
    }

// print the contents of the interaction queue
    ial.printAttributeWeightVectorQueue = function() {
        console.log("Printing Attribute Weight Vector Queue (" + this.attributeWeightVectorQueue.length + "): ");
        for (var i in this.attributeWeightVectorQueue) console.log(this.attributeWeightVectorQueue[i]);
    }

    ial.attributeWeightVectorEnqueue = function(obj) {
        if (typeof obj === 'undefined' || obj == null) return;

        if (this.attributeWeightVectorQueue.length >= this.maxQueueSize) {
            console.log("Max queue size reached"); 
            ial.attributeWeightVectorDequeue();
        }
        this.attributeWeightVectorQueue.push(obj);
    }

    ial.attributeWeightVectorDequeue = function() {
        return this.attributeWeightVectorQueue.shift(); 
    }

// private
// time arg can be a Date object; returns all interactions that occurred since 'time'
// time arg can be an integer; returns the last 'time' interactions
// interactionTypes defines which types of interactions to consider
    function getInteractionQueueSubset(time, interactionTypes) {
        this.interactionQueue = ial.utils.clone(ial.getInteractionQueue());
        var interactionSubset = [];

        if (typeof time === 'undefined') time = this.interactionQueue.length;

        if (time instanceof Date) {
            for (var i = 0; i < this.interactionQueue.length; i++) {
                var curLog = this.interactionQueue[i];
                var curTime = curLog.eventTimeStamp;
                var curEventType = curLog['customLogInfo']['eventType'];
                if (curTime.getTime() >= time.getTime() && (typeof interactionTypes == 'undefined' || interactionTypes.indexOf(curEventType) > -1))
                    interactionSubset.push(this.interactionQueue[i]);
            }
        } else if (!isNaN(parseInt(time))) {
            if (time > this.interactionQueue.length) time = this.interactionQueue.length;
            var numLogs = 0;
            var i = this.interactionQueue.length - 1;
            while (i >= 0 && numLogs <= time) {
                var curLog = this.interactionQueue[i];
                var curEventType = curLog['customLogInfo']['eventType'];
                if (typeof interactionTypes == 'undefined' || interactionTypes.indexOf(curEventType) > -1) {
                    interactionSubset.push(curLog);
                    numLogs++;
                }
                i--;
            }
        }

        return interactionSubset;
    }

// private
// 'time' can be a Date object; returns all interactions that occurred since 'time'
// 'time' can be an integer; returns the last 'time' interactions
// interactionTypes defines which types of interactions to consider
    function getInteractionQueueSubsetByEventType(time, interactionTypes) {
        var interactionSubsetQueues = {};
        this.interactionQueue = ial.getInteractionQueue(); 

        if (typeof time === 'undefined') time = this.interactionQueue.length;

        if (time instanceof Date) {
            interactionSubsetQueues = {};
            for (var i = 0; i < this.interactionQueue.length; i++) {
                var curLog = this.interactionQueue[i];
                var curTime = curLog.eventTimeStamp;
                var curEventType = curLog.customLogInfo.eventType;
                if (curEventType === 'undefined') curEventType = 'uncategorized';
                if (curTime.getTime() >= time.getTime() && (typeof interactionTypes == 'undefined' || interactionTypes.indexOf(curEventType) > -1)) {
                    var curQueue = [];
                    if (interactionSubsetQueues.hasOwnProperty(curEventType)) curQueue = interactionSubsetQueues[curEventType];

                    curQueue.push(curLog);
                    interactionSubsetQueues[curEventType] = curQueue;
                }
            }
        } else if (!isNaN(parseInt(time))) {
            interactionSubsetQueues = {};
            if (time > this.interactionQueue.length) time = this.interactionQueue.length;
            var i = 0;
            var numLogs = 0;
            while (i < this.interactionQueue.length && numLogs <= time) {
                var curLog = this.interactionQueue[i];
                var curEventType = curLog.customLogInfo.eventType;
                if (curEventType === 'undefined') curEventType = 'uncategorized';
                if (typeof interactionTypes == 'undefined' || interactionTypes.indexOf(curEventType) > -1) {
                    var curQueue = [];
                    if (interactionSubsetQueues.hasOwnProperty(curEventType)) curQueue = interactionSubsetQueues[curEventType];

                    curQueue.push(curLog);
                    interactionSubsetQueues[curEventType] = curQueue;
                    numLogs++;
                }
                i++;
            }
        }

        return interactionSubsetQueues;
    }

// private
// arg can be a Date object; returns all interactions that occurred since 'time'
// arg can be an integer; returns the last 'time' interactions
    function getWeightVectorQueueSubset(time) {
        this.attributeWeightVectorQueue = ial.getAttributeWeightVectorQueue();
        var weightVectorSubset = ial.getAttributeWeightVectorQueue();

        if (typeof time !== 'undefined') {
            if (time instanceof Date) {
                weightVectorSubset = [];
                for (var i = 0; i < this.attributeWeightVectorQueue.length; i++) {
                    var curTime = this.attributeWeightVectorQueue[i].eventTimeStamp;
                    if (curTime.getTime() >= time.getTime()) weightVectorSubset.push(this.attributeWeightVectorQueue[i]);
                }
            } else if (!isNaN(parseInt(time))) {
                weightVectorSubset = [];
                if (time > this.attributeWeightVectorQueue.length) time = this.attributeWeightVectorQueue.length;
                for (var i = 0; i < time; i++)
                    weightVectorSubset.push(this.attributeWeightVectorQueue[i]);
            }
        }

        return weightVectorSubset;
    }

// private
// computes variance for numerical attributes and entropy for categorical attributes
// entropy ref: http://www.cs.rochester.edu/u/james/CSC248/Lec6.pdf
    function computeAttributeVariance(data, attr) {
        data = getArray(data);
        var attributeValueMap = ial.getAttributeValueMap();
        if (attributeValueMap[attr].dataType == 'categorical') {
            var distr = computeCategoricalDistribution(data, attr);
            var ent = 0;
            var curSum = data.length;
            for (attrVal in distr) {
                var curVal = distr[attrVal];
                ent += ((curVal / curSum) * Math.log2(curVal / curSum));
            }
            if (ent != 0) ent *= -1;
            return ent;
        } else if (attributeValueMap[attr].dataType == 'numeric') {
            var mean = 0;

            // find mean
            data.forEach(function(curDataItem) {
                var curValue = parseFloat(curDataItem[attr]);
                mean += curValue;
            });
            mean /= data.length;

            // find variance
            var variance = 0;
            data.forEach(function(curDataItem) {
                var curValue = parseFloat(curDataItem[attr]);
                var curSqDiff = (curValue - mean) * (curValue - mean);
                variance += curSqDiff;
            });
            variance /= data.length;

            return variance;
        } else return 0;
    }

// private
// computes distribution of categorical attribute values
    function computeCategoricalDistribution(data, attr) {
        data = getArray(data);
        var attributeValueMap = ial.getAttributeValueMap();
        var distribution = {};

        for (var i = 0; i < data.length; i++) {
            var attrValue = data[i][attr];
            if (distribution.hasOwnProperty(attrValue)) distribution[attrValue]++;
            else distribution[attrValue] = 1;
        }

        return distribution;
    }

// make sure you're dealing with an array
    function getArray(arrayLike) {
        let arr = Array.from(arrayLike);
        return arr;
    }

// returns the current queue of bias logs
    ial.getBiasLogs = function() {
        return ial.utils.clone(this.biasLogs);
    }

// print bias logs to console
    ial.printBiasLogs = function() {
        // print data
        console.log("dataset", this.dataSet);

        // print attribute information
        console.log("attributes", this.getAttributeValueMap());

        // iterate through queue
        console.log("# bias logs: " + this.biasLogs.length);
        for (var i = 0; i < this.biasLogs.length; i++) console.log("bias log", this.biasLogs[i]);

        // print individual interaction records
        console.log("# interaction logs: " + this.interactionQueue.length);
        for (var i = 0; i < this.interactionQueue.length; i++) console.log("interaction log", this.interactionQueue[i]);

        // print attribute weight change records
        console.log("# attribute weight logs: " + this.attributeWeightVectorQueue.length);
        for (var i = 0; i < this.attributeWeightVectorQueue.length; i++) console.log("attribute weight log", this.attributeWeightVectorQueue[i]);
    }



    /*
     * Bias metrics
     * */

// compute bias metrics
// metric (optional) which bias metric to compute (defaults to compute all metrics)
// time (optional) can be given as a Date object or a number representing the number of previous interactions to consider (default is to consider the full queue) 
// interactionTypes (optional) can specify to only compute bias on particular types of interaction (based on eventType key in customLogInfo)
// considerSpan (optional) considers distance between repeated interactions for repetition metric (defaults to true)
// scoreType (optional) defines parameter for attribute weight metric (defaults to span)
// returns true if bias is detected, false otherwise
    ial.computeBias = function(metric, time, interactionTypes, considerSpan, scoreType) {
        if (typeof metric !== 'undefined') {
            if (metric == this.BIAS_ATTRIBUTE_WEIGHT) return ial.computeAttributeWeightBias(time, scoreType);
            else if (metric == this.BIAS_REPETITION) return ial.computeRepetitionBias(time, interactionTypes, considerSpan);
            else if (metric == this.BIAS_SUBSET) return ial.computeSubsetBias(time, interactionTypes);
            else if (metric == this.BIAS_SCREEN_TIME) return ial.computeScreenTimeBias();
            else return ial.computeVarianceBias(time, interactionTypes);
        } else {
            var numMetrics = this.BIAS_TYPES.length;
            var biasResultMap = {};
            var attributeWeightBias = ial.computeAttributeWeightBias(time, scoreType);
            var repetitionBias = ial.computeRepetitionBias(time, interactionTypes, considerSpan);
            var subsetBias = ial.computeSubsetBias(time, interactionTypes);
            var varianceBias = ial.computeVarianceBias(time, interactionTypes);
            var screenTimeBias = ial.computeScreenTimeBias();
            
            biasResultMap['attribute_weight_metric'] = attributeWeightBias;
            biasResultMap['repetition_metric'] = repetitionBias;
            biasResultMap['subset_metric'] = subsetBias;
            biasResultMap['variance_metric'] = varianceBias;
            biasResultMap['screen_time_metric'] = screenTimeBias;

            var avgLevel = 0;
            avgLevel += parseFloat(attributeWeightBias['metric_level']);
            avgLevel += parseFloat(repetitionBias['metric_level']);
            avgLevel += parseFloat(subsetBias['metric_level']);
            avgLevel += parseFloat(varianceBias['metric_level']);
            avgLevel += parseFloat(screenTimeBias['metric_level']);
            avgLevel /= numMetrics;
            biasResultMap['metric_level'] = avgLevel;

            return biasResultMap;
        }
    }

// the subset bias metric relates to the percentage of interactions that were with unique data items
// metric = 1 - (# unique data items interacted with) / (max # interactions) 
// time (optional) the time frame of interactions to consider (defaults to all logged interactions)
// interactionTypes (optional) limits scope of computation to particular interaction types or all if left unspecified
    ial.computeSubsetBias = function(time, interactionTypes) {
        var interactionSubset = getInteractionQueueSubset(time, interactionTypes);

        var currentLog = {};
        currentLog['bias_type'] = this.BIAS_SUBSET;
        currentLog['current_time'] = new Date();
        currentLog['number_of_logs'] = interactionSubset.length;
        var currentLogInfo = {};
        currentLogInfo['interaction_types'] = interactionTypes;

        var maxInteractions = Math.min(interactionSubset.length, this.dataSet.length);

        // figure out how many interactions were with unique data items
        var idSet = new Set();
        for (var i = 0; i < interactionSubset.length; i++)
            idSet.add(interactionSubset[i].dataItem.ial.id);

        var percentUnique = idSet.size / maxInteractions;

        currentLogInfo['max_interactions'] = maxInteractions;
        currentLogInfo['unique_data'] = idSet.size;
        currentLogInfo['percentage'] = percentUnique;
        if (interactionSubset.length == 0) // 0 if no interactions
        	currentLogInfo['percentage'] = 0;
        currentLog['info'] = currentLogInfo;
        
        // lower percent of unique interactions -> higher level of bias
        currentLog['metric_level'] = 1.0 - percentUnique; 
        if (interactionSubset.length == 0) // 0 if no interactions
        	currentLog['metric_level'] = 0;

        this.biasLogs.push(currentLog);
        return currentLog;
    }

// the repetition metric relates to the number of times a particular data item has been interacted with
// metric(t, n) = (# of interactions of type t with d_n) / (total number of interactions)
// time (optional) the time frame of interactions to consider (defaults to all logged interactions)
// interactionTypes (optional) limits scope of computation to particular interaction types or all if left unspecified
// considerSpan = true lowers contributing score of repetitions by scaling according to how spread out the interactions are
//   interactions are weighted: 
//     if considerSpan: score = (number of repeated interactions / total number of interactions) * (1 / difference in indices of first and last occurrence)
//     else: number of repeated interactions / total number of interactions
    ial.computeRepetitionBias = function(time, interactionTypes, considerSpan) {
        if (typeof considerSpan === 'undefined' || (considerSpan != true && considerSpan != false)) considerSpan = true;
        var interactionSubset = getInteractionQueueSubsetByEventType(time, interactionTypes);
        var origInteractionSubset = getInteractionQueueSubset(time, interactionTypes);

        var currentLog = {};
        var curDate = new Date();
        currentLog['bias_type'] = this.BIAS_REPETITION;
        currentLog['current_time'] = new Date();
        var currentLogInfo = {};
        currentLogInfo['interaction_types'] = interactionTypes;
        currentLogInfo['consider_span'] = considerSpan;
        
        if (Object.keys(interactionSubset).length == 0) { // 0 if no interactions
        	currentLog['info'] = currentLogInfo;
        	currentLog['number_of_logs'] = interactionSubset.length;
        	currentLog['metric_level'] = 0;
        	return currentLog;
        }

        // create a map to track # of occurrences of each (interaction, data item) tuple
        var repetitionMap = {};
        var numLogsCounter = 0;
        var intTypeCounter = 0;
        for (var eventTypeKey in interactionSubset) {
            var curQueue = interactionSubset[eventTypeKey];
            for (var i = 0; i < curQueue.length; i++) {
                numLogsCounter++;
                var curId = curQueue[i].dataItem.ial.id;
                if (repetitionMap.hasOwnProperty(eventTypeKey)) {
                    var curObj = repetitionMap[eventTypeKey];
                    if (curObj.hasOwnProperty(curId)) repetitionMap[eventTypeKey][curId]++;
                    else {
                        repetitionMap[eventTypeKey][curId] = 1;
                        intTypeCounter++;
                    }
                } else {
                	repetitionMap[eventTypeKey] = {};
                    repetitionMap[eventTypeKey][curId] = 1; 
                    intTypeCounter++;
                }
            }
        }
        currentLog['number_of_logs'] = numLogsCounter;

        var avgLevel = 0; 
        var numScores = 0; 
        for (var eventTypeKey in repetitionMap) {
            var curQueue = repetitionMap[eventTypeKey];
            for (var curId in curQueue) {
                var curKey = eventTypeKey + "," + curId;
                var score = repetitionMap[eventTypeKey][curId] / numLogsCounter;
                if (considerSpan) {

                	// find indices of when eventTypeKey occurred with data item curId
                	var occurrenceIndices = [];
                	for (var j = 0; j < origInteractionSubset.length; j++) {
                		var curObj = origInteractionSubset[j];
                		if (curObj.dataItem.ial.id == curId && curObj['customLogInfo'].hasOwnProperty('eventType') && curObj['customLogInfo']['eventType'] == eventTypeKey) {
                			occurrenceIndices.push(j);
                			if (occurrenceIndices.length == repetitionMap[eventTypeKey][curId]) break;
                		}
                	}

                	var span = Math.abs(occurrenceIndices[occurrenceIndices.length - 1] - occurrenceIndices[0]) + 1;
                	score *= (1 / span);
                	if (occurrenceIndices.length == 1) score = 0;
                	// TODO: should this only count if it's more than 1 interaction? 
                	avgLevel += score; 
                	currentLogInfo[curKey] = {'metric_level' : score, 'count' : repetitionMap[eventTypeKey][curId], 'span' : span};
                } else
                	currentLogInfo[curKey] = {'metric_level' : score, 'count' : repetitionMap[eventTypeKey][curId], 'span' : 1};
                numScores++; 
            }
        }
        
        avgLevel /= numScores; 

        currentLogInfo['num_interaction_types'] = intTypeCounter;
        currentLogInfo['num_tuples'] = numScores;
        currentLog['info'] = currentLogInfo;
        // metric level in this case represents the average metric level across all (interaction, data item) tuples
        currentLog['metric_level'] = avgLevel;

        this.biasLogs.push(currentLog);
        return currentLog;
    }

// the variance metric relates to the variance of the data interacted with compared to the variance of the dataset as a whole
// metric(a_m) = 1 - p, where p is defined as the F statistic (numerical attributes) or the Chi^2 statistic (categorical attributes) for attribute a_m
// F = var(D_U(a_m)) / var(D(a_m), where D_U is the data the user has interacted with
// CHI^2 = SUM(O(a_m,k) - E(a_m,k))^2 / E(a_m,k), 
//    where O is the observed number of data points interacted with that have value k for attribute a_m 
//    and E is the expected number of data points interacted with that have value k for attribute a_m
// time (optional) the time frame of interactions to consider (defaults to all logged interactions)
// interactionTypes (optional) limits scope of computation to particular interaction types or all if left unspecified
    ial.computeVarianceBias = function(time, interactionTypes) {
        var attributeValueMap = ial.getAttributeValueMap();
        var interactionSubset = getInteractionQueueSubset(time, interactionTypes);

        var currentLog = {};
        var curDate = new Date();
        currentLog['bias_type'] = this.BIAS_VARIANCE;
        currentLog['current_time'] = new Date();
        currentLog['number_of_logs'] = interactionSubset.length;
        var currentLogInfo = {};
        currentLogInfo['interaction_types'] = interactionTypes;
        
        if (Object.keys(interactionSubset).length == 0) { // 0 if no interactions
        	currentLog['info'] = currentLogInfo;
        	currentLog['metric_level'] = 0;
        	return currentLog;
        }

        var dataSubset = [];
        for (var i = 0; i < interactionSubset.length; i++) dataSubset.push(interactionSubset[i].dataItem);

        var varianceVector = {};
        var avgProb = 0;

        for (var attr in attributeValueMap) {
            varianceVector[attr] = {};
            if (attributeValueMap[attr].dataType == 'numeric') {
                var curVariance = Number(computeAttributeVariance(dataSubset, attr));
                var fullVariance = Number(attributeValueMap[attr]['variance']);
                var fValue = curVariance / fullVariance;
                var dfFull = this.dataSet.length - 1; 
                var dfSub = dataSubset.length - 1; 
                var prob = getFPercent(fValue, dfSub, dfFull);
                avgProb += prob;

                varianceVector[attr]["type"] = "numeric";
                varianceVector[attr]["degrees_of_freedom_1_full"] = dfFull; 
                varianceVector[attr]["degrees_of_freedom_2_sub"] = dfSub;
                varianceVector[attr]["f_value"] = fValue;
                varianceVector[attr]["metric_level"] = prob; // TODO: should this be prob or 1 - prob? 

            } else if (attributeValueMap[attr].dataType == 'categorical') {
                // variance for categorical attributes returns chi-squared test
                var distr = computeCategoricalDistribution(dataSubset, attr);
                var fullDistr = attributeValueMap[attr]["distribution"];
                var chiSq = 0; 
                for (attrVal in fullDistr) {
                    var expVal = dataSubset.length * (parseFloat(fullDistr[attrVal]) / this.dataSet.length);
                    var obsVal = 0; 
                    if (distr.hasOwnProperty(attrVal)) obsVal = parseFloat(distr[attrVal]);
                    chiSq += Math.pow(obsVal - expVal, 2) / expVal; 
                }
                var degFree = Object.keys(fullDistr).length - 1;
                var prob = getChiSquarePercent(chiSq, degFree);
                avgProb += prob;
                
                varianceVector[attr]["type"] = "categorical";
                varianceVector[attr]["degrees_of_freedom"] = degFree; 
                varianceVector[attr]["chi_squared"] = chiSq;
                varianceVector[attr]["metric_level"] = prob; // TODO: should this be prob or 1 - prob? 
            }
        }
        avgProb /= Object.keys(attributeValueMap).length;

        currentLogInfo['variance_vector'] = varianceVector;
        currentLogInfo['num_attributes'] = Object.keys(attributeValueMap).length;
        currentLog['info'] = currentLogInfo;
        // metric level in this case represents the average metric level across all attributes
        currentLog['metric_level'] = avgProb;

        this.biasLogs.push(currentLog);
        return currentLog;
    }

// the attribute weight metric relates to the percent change in each attribute's weight over time
// metric(a_m) = 1 - |w_a_m(t + d) - w_a_m(t)| / w_a_m(t), where w_a_m(t) is the weight of attribute a_m at time t
// time (optional) the time frame of interactions to consider (defaults to all logged interactions)
// scoreType (optional) alternative ways to consider an attribute's change in weight (span, average, min, or max - defaults to span)
    ial.computeAttributeWeightBias = function(time, scoreType) {
        var attributeValueMap = ial.getAttributeValueMap();
        if (this.ATTRIBUTE_SCORES.indexOf(scoreType) < 0) scoreType = this.ATTRIBUTE_SCORES[0];
        var weightVectorSubset = getWeightVectorQueueSubset(time);

        var currentLog = {};
        var curDate = new Date();
        currentLog['bias_type'] = this.BIAS_ATTRIBUTE_WEIGHT;
        currentLog['current_time'] = new Date();
        currentLog['number_of_logs'] = weightVectorSubset.length;
        var currentLogInfo = {};
        currentLogInfo['score_type'] = scoreType;

        if (Object.keys(weightVectorSubset).length == 0) {
            currentLog['info'] = currentLogInfo;
            currentLog['metric_level'] = 0;
            return currentLog;
        }

        var changeVector = {};
        if (scoreType == 'span') {
        	// consider only the oldest and most recent weight vectors
            var firstVector = weightVectorSubset[0].oldWeight;
            var lastVector = weightVectorSubset[weightVectorSubset.length - 1].newWeight;
            for (var curKey in attributeValueMap) {
                if (firstVector.hasOwnProperty(curKey) && lastVector.hasOwnProperty(curKey)) {
                	changeVector[curKey] = {};
                    var curChange = Math.abs(lastVector[curKey] - firstVector[curKey]);
                    if (firstVector[curKey] != 0) curChange = curChange / firstVector[curKey];
                    changeVector[curKey]['old'] = firstVector[curKey]; 
                    changeVector[curKey]['new'] = lastVector[curKey];
                    changeVector[curKey]['change'] = curChange;
                    if (curChange > 1) curChange = 1; // set maximum change to be 1
                    changeVector[curKey]['metric_level'] = 1.0 - curChange;
                }
            }
        } else if (scoreType == 'min') {
            // consider the smallest change in weight for each attribute
            for (var i = 0; i < weightVectorSubset.length; i++) {
                var oldVector = weightVectorSubset[i].oldWeight;
                var newVector = weightVectorSubset[i].newWeight;
                for (var curKey in attributeValueMap) {
                    if (oldVector.hasOwnProperty(curKey) && newVector.hasOwnProperty(curKey)) {
                        var curChange = Math.abs(newVector[curKey] - oldVector[curKey]);
                        if (oldVector[curKey] != 0) curChange = curChange / oldVector[curKey];
                        if ((!changeVector.hasOwnProperty(curKey)) || (changeVector.hasOwnProperty(curKey) && curChange < changeVector[curKey]['change'])) {
                        	changeVector[curKey] = {};
                        	changeVector[curKey]['old'] = oldVector[curKey];
                        	changeVector[curKey]['new'] = newVector[curKey];
                        	changeVector[curKey]['change'] = curChange;
                        	if (curChange > 1) curChange = 1; // set maximum change to be 1
                        	changeVector[curKey]['metric_level'] = 1.0 - curChange;
                    	} 
                    } 
                }
            }
        } else if (scoreType == 'max') {
            // consider the largest change in weight for each attribute
            for (var i = 0; i < weightVectorSubset.length; i++) {
                var oldVector = weightVectorSubset[i].oldWeight;
                var newVector = weightVectorSubset[i].newWeight;
                for (var curKey in attributeValueMap) {
                    if (oldVector.hasOwnProperty(curKey) && newVector.hasOwnProperty(curKey)) {
                        var curChange = Math.abs(newVector[curKey] - oldVector[curKey]);
                        if (oldVector[curKey] != 0) curChange = curChange / oldVector[curKey];
                        if ((!changeVector.hasOwnProperty(curKey)) || (changeVector.hasOwnProperty(curKey) && curChange > changeVector[curKey]['change'])) {
                        	changeVector[curKey] = {};
                        	changeVector[curKey]['old'] = oldVector[curKey];
                        	changeVector[curKey]['new'] = newVector[curKey];
                        	changeVector[curKey]['change'] = curChange;
                        	if (curChange > 1) curChange = 1; // set maximum change to be 1
                        	changeVector[curKey]['metric_level'] = 1.0 - curChange;
                    	} 
                    } 
                }
            }
        } else {
            // compute as scoreType = 'average'
            var mult = 1 / weightVectorSubset.length;
            for (var i = 0; i < weightVectorSubset.length; i++) {
                var oldVector = weightVectorSubset[i].oldWeight;
                var newVector = weightVectorSubset[i].newWeight;
                for (var curKey in attributeValueMap) {
                    if (oldVector.hasOwnProperty(curKey) && newVector.hasOwnProperty(curKey)) {
                        var curChange = Math.abs(newVector[curKey] - oldVector[curKey]);
                        if (oldVector[curKey] != 0) curChange = curChange / oldVector[curKey];
                        if (changeVector.hasOwnProperty(curKey)) {
                        	changeVector[curKey]['change'] += (mult * curChange);
                        	if (curChange > 1) curChange = 1; // set maximum change to be 1
                        	changeVector[curKey]['metric_level'] += (1.0 - (mult * curChange));
                        } else {
                        	changeVector[curKey] = {};
                        	changeVector[curKey]['change'] = (mult * curChange);
                        	if (curChange > 1) curChange = 1; // set maximum change to be 1
                        	changeVector[curKey]['metric_level'] = (1.0 - (mult * curChange));
                        }
                    }
                }
            }
        }
        
        var avgLevel = 0; 
        for (var curKey in attributeValueMap)
        	avgLevel += changeVector[curKey]['metric_level'];
        avgLevel /= Object.keys(attributeValueMap).length;

        currentLogInfo['change_vector'] = changeVector; 
        currentLogInfo['num_attributes'] = Object.keys(attributeValueMap).length;
        currentLog['info'] = currentLogInfo;
        // metric level in this case represents the average metric level across all attributes
        currentLog['metric_level'] = avgLevel;

        this.biasLogs.push(currentLog);
        return currentLog;
    }
    
// the screen time metric relates to how long each data item is visible on the screen
// metric(n) = 1- p, where p is defined as the probability of the Z-statistic (number of standard deviations from the mean)
    ial.computeScreenTimeBias = function() {
    	 var currentLog = {};
         currentLog['bias_type'] = this.BIAS_SCREEN_TIME;
         currentLog['current_time'] = new Date();
         currentLog['number_of_logs'] = this.dataSet.length;
         var currentLogInfo = {};
         
         // TODO: We aren't currently tracking screen time -- for now, return an empty log
         currentLog['info'] = currentLogInfo; 
         currentLog['metric_level'] = 0;
         return currentLog;
         
         
         
   
         
    	 // compute average screen time
    	 var avgTime = 0;
    	 for (var index in this.dataSet) 
    		 avgTime += this.dataSet[index]['ial']['screen_time'];
    	 avgTime /= this.dataSet.length;
    	 currentLogInfo['mean'] = avgTime;
    	 
    	 // compute standard deviation
    	 var stdDev = 0; 
    	 for (var index in this.dataSet)
    		 stdDev += ((this.dataSet[index]['ial']['screen_time'] - avgTime) * (this.dataSet[index]['ial']['screen_time'] - avgTime));
         stdDev /= this.dataSet.length; 
         stdDev = Math.sqrt(stdDev);
         currentLogInfo['standard_deviation'] = stdDev;
         
         // compute z-scores and probabilities
         var scores = {};
         var avgLevel = 0; 
         for (var index in this.dataSet) {
        	 scores[index] = {};
        	 scores[index]['screen_time'] = this.dataSet[index]['ial']['screen_time'];
        	 var zScore = (this.dataSet[index]['ial']['screen_time'] - avgTime) / stdDev;
        	 scores[index]['z_score'] = zScore;
        	 var prob = getZPercent(zScore); 
        	 scores[index]['metric_level'] = prob; 
        	 avgLevel += prob; 
         }
         avgLevel /= this.dataSet.length;

         currentLogInfo['scores'] = scores;
         currentLog['info'] = currentLogInfo;
         // metric level in this case represents the average metric level across all data points
         currentLog['metric_level'] = avgLevel;

         this.biasLogs.push(currentLog);
         return currentLog;
     }



    /*
     * ---------------------
     *   Utility functions
     * ---------------------
     * */

    ial.utils = {}
    ial.utils.logGamma = function(x) {
        var curVal = 1 + 76.18009173 / x - 86.50532033 / (x + 1) + 24.01409822 / (x + 2) - 1.231739516 / (x + 3) + .00120858003 / (x + 4) - .00000536382 / (x + 5);
        var logRes = (x - .5) * Math.log(x + 4.5) - (x + 4.5) + Math.log(curVal * 2.50662827465);
        return logRes;
    }

    ial.utils.clone = function(obj) {
        // Handle the 3 simple types, and null or undefined
        if (null == obj || "object" != typeof obj) return obj;

        // Handle Date
        if (obj instanceof Date) {
            var copy = new Date();
            copy.setTime(obj.getTime());
            return copy;
        }

        // Handle Array
        if (obj instanceof Array) {
            var copy = [];
            for (var i = 0, len = obj.length; i < len; i++) {
                copy[i] = ial.utils.clone(obj[i]);
            }
            return copy;
        }

        // Handle Object
        if (obj instanceof Object) {
            var copy = {};
            for (var attr in obj) {
                if (obj.hasOwnProperty(attr)) copy[attr] = ial.utils.clone(obj[attr]);
            }
            return copy;
        }

        throw new Error("Unable to copy obj! Its type isn't supported.");
    }

// private
    function sortObj(list, key, order) {
        order = typeof order !== 'undefined' ? order : 'a';
        function compare(a, b) {
            if(key == "ial.weight" || key == "ial.id" || key == "ial.itemScore") {
                a = a["ial"][key.split('.')[1]];
                b = b["ial"][key.split('.')[1]];
            } else {
                a = a[key];
                b = b[key];
            }
            var type = (typeof(a) === 'string' ||
            typeof(b) === 'string') ? 'string' : 'number';
            var result;
            if (type === 'string') result = a.localeCompare(b);
            else {
                if (order == 'a') {
                    result = a - b;
                } else if (order == 'd') {
                    result = b - a;
                }
            }
            return result;
        }
        return list.sort(compare);
    }
    
/** Probability Distributions **/

// private
// get the percent probability given the z-score
// where z-score represents number of standard deviations from the mean
    function getZPercent(z) {
    	// if z > 6.5 std dev's from the mean, it requires too many significant digits 
        if ( z < -6.5)
          return 0.0;
        if ( z > 6.5) 
          return 1.0;

        // compute percent
        var factK = 1;
        var sum = 0;
        var term = 1;
        var k = 0;
        var loopStop = Math.exp(-23);
        while (Math.abs(term) > loopStop) {
          term = .3989422804 * Math.pow(-1, k) * Math.pow(z, k) / (2 * k + 1) / Math.pow(2, k) * Math.pow(z, k + 1) / factK;
          sum += term;
          k++;
          factK *= k;
        }
        sum += 0.5;

        return sum;
    }
    
// private 
// get the percent probability given the f-statistic, numerator degrees of freedom (df1)
// and denominator degrees of freedom (df2)
    function getFPercent(f, df1, df2) {
    	
    	if (df1 <= 0) {
    		console.log('Numerator degrees of freedom must be positive');
    		df1 = 1;
    	}
    	else if (df2 <= 0) {
    		console.log('Denominator degrees of freedom must be positive');
    		df2 = 1;
    	}
    	else if (f <= 0) Fcdf = 0;
    	else {
    		Z = f / (f + df2 / df1);
    		Fcdf = Betacdf(Z, df1 / 2, df2 / 2);
    	}
    	Fcdf = Math.round(Fcdf * 100000) / 100000;
    	return Fcdf;
    }
    
// private
// get the percent probability given the chi^2 test statistic and degrees of freedom
    function getChiSquarePercent(chiSq, df) {
		if (df <= 0) {
			console.log('Degrees of freedom must be positive');
			df = 1; 
		}
		
		Chisqcdf = Gammacdf(chiSq / 2, df / 2);
		Chisqcdf = Math.round(Chisqcdf * 100000) / 100000;
	    return Chisqcdf;
    } 
    
/** Statistic Distribution Utility Functions **/
    
	function LogGamma(Z) {
    	with (Math) {
    		var S = 1 + 76.18009173 / Z - 86.50532033 / (Z + 1) + 24.01409822 / (Z + 2) - 1.231739516 / (Z + 3) + 0.00120858003 / (Z + 4) - 0.00000536382 / (Z + 5);
    		var LG = (Z - 0.5) * log(Z + 4.5) - (Z + 4.5) + log(S * 2.50662827465);
    	}
    	return LG;
    }

    function Betinc(X, A, B) {
    	var A0 = 0;
    	var B0 = 1;
    	var A1 = 1;
    	var B1 = 1;
    	var M9 = 0;
    	var A2 = 0;
    	var C9;
    	while (Math.abs((A1 - A2) / A1) > 0.00001) {
    		A2 = A1;
    		C9 = -(A + M9) * (A + B + M9) * X / (A + 2 * M9) / (A + 2 * M9 + 1);
    		A0 = A1 + C9 * A0;
    		B0 = B1 + C9 * B0;
    		M9 = M9 + 1;
    		C9 = M9 * (B - M9) * X / (A + 2 * M9 - 1) / (A + 2 * M9);
    		A1 = A0 + C9 * A1;
    		B1 = B0 + C9 * B1;
    		A0 = A0 / B1;
    		B0 = B0 / B1;
    		A1 = A1 / B1;
    		B1 = 1;
    	}
    	return A1 / A;
    }

    function Betacdf(Z, A, B) {
        var S;
        var BT;
        var Bcdf;
    	with (Math) {
    		S = A + B;
    		BT = exp(LogGamma(S) - LogGamma(B) - LogGamma(A) + A * log(Z) + B * log(1 - Z));
    		if (Z < (A + 1) / (S + 2))
    			Bcdf = BT * Betinc(Z, A, B)
    		else
    			Bcdf = 1 - BT * Betinc(1 - Z, B, A)
    	}
    	return Bcdf;
    }

	function Gcf(X, A) { // Good for X > A + 1
		with (Math) {
			var A0 = 0;
			var B0 = 1;
			var A1 = 1;
			var B1 = X;
			var AOLD = 0;
			var N = 0;
			while (abs((A1 - AOLD) / A1) > 0.00001) {
				AOLD = A1;
				N = N + 1;
				A0 = A1 + (N - A) * A0;
				B0 = B1 + (N - A) * B0;
				A1 = X * A0 + N * A1;
				B1 = X * B0 + N * B1;
				A0 = A0 / B1;
				B0 = B0 / B1;
				A1 = A1 / B1;
				B1 = 1;
			}
			var Prob = exp(A * log(X) - X - LogGamma(A)) * A1;
		}
		return 1 - Prob;
	}

	function Gser(X, A) { // Good for X < A + 1.
	    with (Math) {
			var T9 = 1 / A;
			var G = T9;
			var I = 1;
			while (T9 > G * 0.00001) {
				T9 = T9 * X / (A + I);
				G = G + T9;
				I = I + 1;
			}
			G = G * exp(A * log(X) - X - LogGamma(A));
	    }
	    return G;
	}

	function Gammacdf(x, a) {
		var GI;
		if (x <= 0)
			GI = 0;
		else if (x < a + 1)
			GI = Gser(x, a);
		else
			GI = Gcf(x, a);
		return GI;
	}
})();
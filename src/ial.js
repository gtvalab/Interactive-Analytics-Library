/**
 * Created by arjun010 on 12/28/15.
 */
(function() {
    ial = {};
    this.ialIdToDataMap = {};
    this.useNormalizedAttributeWeights;
    this.maxWeight; 
    this.minWeight;
    /*
     * specialAttributeList is an optional list of one or more attributes
     * condition is either 'includeOnly','exclude'
     * */
    ial.init = function(passedData,normalizeAttributeWeights,specialAttributeList,condition,minimumWeight,maximumWeight) {
        normalizeAttributeWeights = typeof normalizeAttributeWeights !== 'undefined' ? normalizeAttributeWeights : 0;
        minimumWeight = (typeof minimumWeight !== 'undefined' && !isNaN(minimumWeight)) ? minimumWeight : 0;
        maximumWeight = (typeof maximumWeight !== 'undefined' && !isNaN(maximumWeight)) ? maximumWeight : 1;
        this.minWeight = Number(minimumWeight);
        this.maxWeight = Number(maximumWeight);
        
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
        this.attributeWeightVector = {}; // map of attributes to weights in range [minWeight,maxWeight]
        this.ialIdToDataMap  = {}; // map from ialId to actual data item
        this.attributeValueMap = {}; // map from attribute name to its data type and summary statistics about it
        this.activeAttributeCount = 0;
        this.sessionLogs = [];

        this.interactionQueue = [];
        this.attributeWeightVectorQueue = [];
        this.biasLogs = [];
        this.maxQueueSize = 10000;
        this.BIAS_DATA_POINT_COVERAGE = 'bias_data_point_coverage';
        this.BIAS_DATA_POINT_DISTRIBUTION = 'bias_data_point_distribution';
        this.BIAS_ATTRIBUTE_COVERAGE = 'bias_attribute_coverage';
        this.BIAS_ATTRIBUTE_DISTRIBUTION = 'bias_attribute_distribution';
        this.BIAS_ATTRIBUTE_WEIGHT_COVERAGE = 'bias_attribute_weight_coverage';
        this.BIAS_ATTRIBUTE_WEIGHT_DISTRIBUTION = 'bias_attribute_weight_distribution';
        //this.BIAS_SCREEN_TIME = 'bias_screen_time';
        // TODO: update this if more metrics are added
        this.BIAS_TYPES = [this.BIAS_DATA_POINT_COVERAGE, this.BIAS_DATA_POINT_DISTRIBUTION, this.BIAS_ATTRIBUTE_COVERAGE, this.BIAS_ATTRIBUTE_DISTRIBUTION, this.BIAS_ATTRIBUTE_WEIGHT_COVERAGE, this.BIAS_ATTRIBUTE_WEIGHT_DISTRIBUTION];//this.BIAS_SCREEN_TIME]; 
        
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
                    this.attributeWeightVector[attribute] = 0;
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
            	var curDistribution = [];
            	var curMean = 0;
                var curMin = parseFloat(passedData[0][attribute]);
                var curMax = parseFloat(passedData[0][attribute]);
                for (var index in passedData) {
                    var dataItem = passedData[index];
                    var curVal = parseFloat(dataItem[attribute]);
                    if (curVal < curMin) curMin = curVal;
                    if (curVal > curMax) curMax = curVal;
                    curMean += curVal;
                    curDistribution.push(curVal);
                }
                curDistribution.sort(function(a, b) {return a - b});
                this.attributeValueMap[attribute]['min'] = curMin;
                this.attributeValueMap[attribute]['max'] = curMax;
                this.attributeValueMap[attribute]['mean'] = curMean / passedData.length;
                this.attributeValueMap[attribute]['distribution'] = curDistribution; 
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
    
    ial.getAttributeVectorAbsoluteSum = function() {
    	var weightSum = 0.0;
    	for(var attribute in this.attributeWeightVector){
    		weightSum += Math.abs(parseFloat(this.attributeWeightVector[attribute]));
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
        var activeSum = 0; // sum of absolute value of attribute weights
        for(var attribute in this.attributeWeightVector){
            if(this.attributeWeightVector[attribute]!=0.0){
                activeSum += Math.abs(this.attributeWeightVector[attribute]);
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
     * returns normalized value in [minWeight,maxWeight] given an attribute's current value and name
     * ref: http://stackoverflow.com/questions/5294955/how-to-scale-down-a-range-of-numbers-with-a-known-min-and-max-value
     * */
    ial.getNormalizedAttributeValue = function(val,attribute) {
        if (this.attributeValueMap[attribute]['dataType'] != 'categorical') {
            var a = this.minWeight, b = this.maxWeight;
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
     * sets attribute's weight to newWeight. Checks to ensure that the weight is always in [minWeight,maxWeight]
     * */
    ial.setAttributeWeight = function(attribute,newWeight,logEvent,additionalLogInfoMap){

        logEvent = typeof logEvent !== 'undefined' ? logEvent : false;
        additionalLogInfoMap = typeof additionalLogInfoMap !== 'undefined' ? additionalLogInfoMap : {};

        var logObj = new LogObj(attribute);
        logObj.setOldWeight(this.attributeWeightVector[attribute]);
        logObj.setEventName('AttributeWeightChange_SET');

        if(this.useNormalizedAttributeWeights==0) {
            if (newWeight > this.maxWeight) {
                this.attributeWeightVector[attribute] = this.maxWeight;
            } else if (newWeight < this.minWeight) {
                this.attributeWeightVector[attribute] = this.minWeight;
            } else {
                this.attributeWeightVector[attribute] = newWeight;
            }
        }else{
            this.attributeWeightVector[attribute] = newWeight;
            ial.normalizeAttributeWeightVector(); 
        }

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
     * Increments attribute's weight by increment. Checks to ensure that the weight is always in [minWeight,maxWeight]
     * */
    ial.incrementAttributeWeight = function(attribute,increment,logEvent,additionalLogInfoMap){
        logEvent = typeof logEvent !== 'undefined' ? logEvent : false;
        additionalLogInfoMap = typeof additionalLogInfoMap !== 'undefined' ? additionalLogInfoMap : {};

        var logObj = new LogObj(attribute);
        logObj.setOldWeight(this.attributeWeightVector[attribute]);
        logObj.setEventName('AttributeWeightChange_UPDATE');

        var newWeight = this.attributeWeightVector[attribute] + increment;

        if(this.useNormalizedAttributeWeights==0) {
            if (newWeight > this.maxWeight) {
                this.attributeWeightVector[attribute] = this.maxWeight;
            } else if (newWeight < this.minWeight) {
                this.attributeWeightVector[attribute] = this.minWeight;
            } else {
                this.attributeWeightVector[attribute] = newWeight;
            }
        }else{
            this.attributeWeightVector[attribute] = newWeight;
            ial.normalizeAttributeWeightVector();
        }

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
            if(this.attributeWeightVector[attribute]>this.maxWeight){
                this.attributeWeightVector[attribute] = this.maxWeight;
            }
            if(this.attributeWeightVector[attribute]<this.minWeight){
                this.attributeWeightVector[attribute] = this.minWeight;
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
     * resets the attributeWeightVector to have all 0s
     * TODO: what should reset actually do? all 0s? all maxWeights? all minWeights?
     * */
    ial.resetAttributeWeightVector = function (logEvent,additionalLogInfoMap) {
        logEvent = typeof logEvent !== 'undefined' ? logEvent : false;
        additionalLogInfoMap = typeof additionalLogInfoMap !== 'undefined' ? additionalLogInfoMap : {};

        var logObj = new LogObj(ial.utils.clone(ial.printAttributeWeightVectorQueue));
        logObj.setOldWeight(ial.utils.clone(this.attributeWeightVector));
        logObj.setEventName('AttributeWeightChange_RESET');

        for(var attribute in this.attributeWeightVector){
            this.attributeWeightVector[attribute] = 0.0;
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

        if(this.useNormalizedAttributeWeights==1){
            ial.normalizeAttributeWeightVector();
        }

        ial.updateItemScores();
    };

    /*
     * Nullifies attributeWeightVector to 0s
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
    	var minWeight = this.minWeight;
    	var maxWeight = this.maxWeight;

        // returns maxWeight-result since goal is to find similarity
        var getNormalizedAttributeWeightByVariance = function(variance,minVariance,maxVariance) {
            var a = minWeight, b = maxWeight;
            var min = minVariance;
            var max = maxVariance;

            var normalizedValue = b-(((b - a) * (variance - min) / (max - min)) + a);

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
            }else{ // TODO: How is this working for categorical variables now? 
                var uniqueVals = getUniqueList(attributeValueListMap[attribute]);
                if(uniqueVals.length>1){
                    tempAttributeWeightVector[attribute] = 0;
                }else{
                    tempAttributeWeightVector[attribute] = 1;
                }
            }
        }
        console.log(ial.utils.clone(tempAttributeWeightVector));

        // setting weights as normalized values between minWeight and maxWeight based on variances (final step)
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
                    } // TODO: how is this working for categorical? 
                }
            }

            tempAttributeWeightVector = difference;

        } else {
        	console.log("Error: points undefined.");
        	return this.attributeWeightVector;
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
 // 'time' can be a Date object; returns all interactions that occurred since 'time'
 // 'time' can be an integer; returns the last 'time' interactions
 // interactionTypes defines which types of interactions to consider
     function getInteractionQueueSubsetByDataPoint(time, interactionTypes) {
         var interactionSubsetQueues = {};
         this.interactionQueue = ial.getInteractionQueue(); 

         if (typeof time === 'undefined') time = this.interactionQueue.length;

         if (time instanceof Date) {
             interactionSubsetQueues = {};
             for (var i = 0; i < this.interactionQueue.length; i++) {
                 var curLog = this.interactionQueue[i];
                 var curTime = curLog.eventTimeStamp;
                 var curData = curLog.dataItem;
                 var curEventType = curLog.customLogInfo.eventType;
                 if (curEventType === 'undefined') curEventType = 'uncategorized';
                 if (curTime.getTime() >= time.getTime() && (typeof interactionTypes == 'undefined' || interactionTypes.indexOf(curEventType) > -1)) {
                     var curQueue = [];
                     if (interactionSubsetQueues.hasOwnProperty(curData.ial.id)) curQueue = interactionSubsetQueues[curData.ial.id];

                     curQueue.push(curLog);
                     interactionSubsetQueues[curData.ial.id] = curQueue;
                 }
             }
         } else if (!isNaN(parseInt(time))) {
             interactionSubsetQueues = {};
             if (time > this.interactionQueue.length) time = this.interactionQueue.length;
             var i = 0;
             var numLogs = 0;
             while (i < this.interactionQueue.length && numLogs <= time) {
                 var curLog = this.interactionQueue[i];
                 var curData = curLog.dataItem;
                 var curEventType = curLog.customLogInfo.eventType;
                 if (curEventType === 'undefined') curEventType = 'uncategorized';
                 if (typeof interactionTypes == 'undefined' || interactionTypes.indexOf(curEventType) > -1) {
                     var curQueue = [];
                     if (interactionSubsetQueues.hasOwnProperty(curData.ial.id)) curQueue = interactionSubsetQueues[curData.ial.id];

                     curQueue.push(curLog);
                     interactionSubsetQueues[curData.ial.id] = curQueue;
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
     */

	// compute bias metrics
	// metric (optional) which bias metric to compute (defaults to compute all metrics)
	// time (optional) can be given as a Date object or a number representing the number of previous interactions to consider (default is to consider the full queue) 
	// interactionTypes (optional) can specify to only compute bias on particular types of interaction (based on eventType key in customLogInfo)
    // numQuantiles (optional) number of quantiles to divide numerical attributes into (default is 4)
	// returns true if bias is detected, false otherwise
    ial.computeBias = function(metric, time, interactionTypes) {
    	if (typeof metric !== 'undefined') {
        	if (metric == this.BIAS_DATA_POINT_COVERAGE) return ial.computeDataPointCoverage(time, interactionTypes);
        	else if (metric == this.BIAS_DATA_POINT_DISTRIBUTION) return ial.computeDataPointDistribution(time, interactionTypes);
        	else if (metric == this.BIAS_ATTRIBUTE_COVERAGE) return ial.computeAttributeCoverage(time, interactionTypes, numQuantiles);
        	else if (metric == this.BIAS_ATTRIBUTE_DISTRIBUTION) return ial.computeAttributeDistribution(time, interactionTypes);
        	else if (metric == this.BIAS_ATTRIBUTE_WEIGHT_COVERAGE) return ial.computeAttributeWeightCoverage(time, interactionTypes, numQuantiles);
        	else if (metric == this.BIAS_ATTRIBUTE_WEIGHT_DISTRIBUTION) return ial.computeAttributeWeightDistribution(time, interactionTypes);
        	// else if (metric == this.BIAS_SCREEN_TIME) return ial.computeScreenTimeBias();
        	else return ial.computeDataPointCoverage(time, interactionTypes);
        } else {
            var numMetrics = this.BIAS_TYPES.length;
            var biasResultMap = {};
            var dataPointCoverage = ial.computeDataPointCoverage(time, interactionTypes);
            var dataPointDistribution = ial.computeDataPointDistribution(time, interactionTypes);
            var attributeCoverage = ial.computeAttributeCoverage(time, interactionTypes, numQuantiles);
            var attributeDistribution = ial.computeAttributeDistribution(time, interactionTypes);
            var attributeWeightCoverage = ial.computeAttributeWeightCoverage(time, interactionTypes, numQuantiles);
            var attributeWeightDistribution = ial.computeAttributeWeightDistribution(time, interactionTypes);
            //var screenTimeBias = ial.computeScreenTimeBias();
            
            biasResultMap['data_point_coverage'] = dataPointCoverage;
            biasResultMap['data_point_distribution'] = dataPointDistribution;
            biasResultMap['attribute_coverage'] = attributeCoverage;
            biasResultMap['attribute_distribution'] = attributeDistribution;
            biasResultMap['attribute_weight_coverage'] = attributeWeightCoverage;
            biasResultMap['attribute_weight_distribution'] = attributeWeightDistribution;
            //biasResultMap['screen_time_metric'] = screenTimeBias;

            var avgLevel = 0;
            avgLevel += parseFloat(dataPointCoverage['metric_level']);
            avgLevel += parseFloat(dataPointDistribution['metric_level']);
            avgLevel += parseFloat(attributeCoverage['metric_level']);
            avgLevel += parseFloat(attributeDistribution['metric_level']);
            avgLevel += parseFloat(attributeWeightCoverage['metric_level']);
            avgLevel += parseFloat(attributeWeightDistribution['metric_level']);
            //avgLevel += parseFloat(screenTimeBias['metric_level']);
            avgLevel /= numMetrics;
            biasResultMap['metric_level'] = avgLevel;

            return biasResultMap;
        }
    }

    
    
	// the data point coverage metric relates to the percentage of interactions that were with unique data items
	// metric = 1 - min[1, (# unique data items interacted with) / (expected # unique data points interacted with)]
	// time (optional) the time frame of interactions to consider (defaults to all logged interactions)
	// interactionTypes (optional) limits scope of computation to particular interaction types or all if left unspecified
    ial.computeDataPointCoverage = function(time, interactionTypes) {
        var interactionSubset = getInteractionQueueSubset(time, interactionTypes);

        var currentLog = {};
        currentLog['bias_type'] = this.BIAS_DATA_POINT_COVERAGE;
        currentLog['current_time'] = new Date();
        currentLog['number_of_logs'] = interactionSubset.length;
        currentLog['interaction_types'] = interactionTypes;
        currentLog['time_window'] = time;
        var currentLogInfo = {};

        // figure out how many interactions were with unique data items
        var idSet = new Set();
        for (var i = 0; i < interactionSubset.length; i++)
            idSet.add(interactionSubset[i].dataItem.ial.id);
        
        // compute expected number of unique data items based on total # of interactions
        var expectedUnique = ial.utils.getMarkovExpectedValue(this.dataSet.length, interactionSubset.length);

        var percentUnique = idSet.size / expectedUnique;

        currentLogInfo['visited'] = idSet;
        currentLogInfo['covered_data'] = idSet.size;
        currentLogInfo['expected_covered_data'] = expectedUnique;
        if (interactionSubset.length == 0) // 100% unique if no interactions
        	percentUnique = 1;
        currentLogInfo['percentage'] = percentUnique;
        currentLog['info'] = currentLogInfo;
        
        // lower percent of unique interactions -> higher level of bias
        currentLog['metric_level'] = 1.0 - Math.min(1, percentUnique);

        this.biasLogs.push(currentLog);
        return currentLog;
    }

	// the data point distribution metric relates to the number of times a particular data point has been interacted with compared to the expected number of interactions with each data point
	// metric = 1 - p, where p is defined as the probability of the Chi^2-statistic, and Chi^2 = (observed - expected)^2 / expected
	// time (optional) the time frame of interactions to consider (defaults to all logged interactions)
	// interactionTypes (optional) limits scope of computation to particular interaction types or all if left unspecified
	ial.computeDataPointDistribution = function(time, interactionTypes) {
    	var origInteractionSubset = getInteractionQueueSubset(time, interactionTypes);
        var interactionSubsetByData = getInteractionQueueSubsetByDataPoint(time, interactionTypes);

        var currentLog = {};
        var curDate = new Date();
        currentLog['bias_type'] = this.BIAS_DATA_POINT_DISTRIBUTION;
        currentLog['current_time'] = new Date();
        currentLog['number_of_logs'] = origInteractionSubset.length;
        currentLog['interaction_types'] = interactionTypes;
        currentLog['time_window'] = time;
        var currentLogInfo = {};
        currentLogInfo['distribution_vector'] = {};
        
        // 0 if no interactions
        if (Object.keys(origInteractionSubset).length == 0) {
        	currentLogInfo['max_observed_interactions'] = 0;
        	currentLog['info'] = currentLogInfo;
        	currentLog['number_of_logs'] = 0;
        	currentLog['metric_level'] = 0;
        	return currentLog;
        }
        
        // compare observed and expected number of interactions for each data point
        var maxObs = 0; 
        var expected = origInteractionSubset.length / this.dataSet.length;
        var chiSq = 0;
        for (var i = 0; i < this.dataSet.length; i++) {
        	var curData = this.dataSet[i];
        	var observed = 0; 
        	if (interactionSubsetByData.hasOwnProperty(curData.ial.id))
        		observed = interactionSubsetByData[curData.ial.id].length;
        	var sqDiff = Math.pow(observed - expected, 2) / Number(expected);
        	if (observed > maxObs) maxObs = observed; 
        	currentLogInfo['distribution_vector'][curData.ial.id] = { 'data_item': curData.ial.id, 'observed': observed, 'expected': expected, 'diff': sqDiff };
        	chiSq += sqDiff;
        }
        	
        var degFree = origInteractionSubset.length - 1;
        var prob = getChiSquarePercent(chiSq, degFree * this.dataSet.length); // emily: what should DoF be?
        currentLogInfo['chi_squared'] = chiSq;
        currentLogInfo['degrees_of_freedom'] = degFree;
        currentLogInfo['max_observed_interactions'] = maxObs;
        currentLog['info'] = currentLogInfo;
        currentLog['metric_level'] = prob;

        this.biasLogs.push(currentLog);
        return currentLog;
    }
	
	// the attribute coverage metric relates to the percentage of quantiles for each attribute covered by user interactions
	// metric(a_m) = 1 - min[1, (# unique quantiles interacted with) / (expected # unique quantiles interacted with)]
	// uses quantiles for numerical attributes and potential attribute values for categorical; a value x falls in quantile i if q_i-1 < x <= q_i
	// time (optional) the time frame of interactions to consider (defaults to all logged interactions)
	// interactionTypes (optional) limits scope of computation to particular interaction types or all if left unspecified
	// numQuantiles (optional) number of quantiles to divide numerical attributes into
    ial.computeAttributeCoverage = function(time, interactionTypes, numQuantiles) {
    	numQuantiles = typeof numQuantiles !== 'undefined' ? numQuantiles : 4;
    	var interactionSubset = getInteractionQueueSubset(time, interactionTypes);

    	var currentLog = {};
    	currentLog['bias_type'] = this.BIAS_ATTRIBUTE_COVERAGE;
    	currentLog['current_time'] = new Date();
    	currentLog['number_of_logs'] = interactionSubset.length;
    	currentLog['interaction_types'] = interactionTypes;
    	currentLog['time_window'] = time;
    	var currentLogInfo = {};
    	currentLogInfo['attribute_vector'] = {};

    	// compare interactions to quantiles
    	var maxMetricValue = 0; 
    	for (var attribute in this.attributeValueMap) {
    		fullDist = this.attributeValueMap[attribute]['distribution'];
    		if (this.attributeValueMap[attribute]['dataType'] == 'numeric') {
    			var quantiles = {};
    			var quantileList = [];
    			for (var i = 0; i < numQuantiles; i++) {
    				if (i != numQuantiles - 1)
    					quantVal = fullDist[Math.floor((i + 1) * this.dataSet.length / numQuantiles) - 1];
    				else
    					quantVal = fullDist[fullDist.length - 1];
    				quantileList.push(quantVal);
    				quantiles[quantVal] = 0;
    			}
    	
    			// figure out distribution of interactions
    			for (var i = 0; i < interactionSubset.length; i++) {
    				var curVal = interactionSubset[i]['dataItem'][attribute];
    				
    				// figure out which quantile it belongs to
    				var whichQuantile = ial.utils.getQuantile(quantileList, curVal);
    				quantiles[whichQuantile] += 1;
    			}
    		
    			currentLogInfo['attribute_vector'][attribute] = {};
    			currentLogInfo['attribute_vector'][attribute]['quantiles'] = quantileList;
    			currentLogInfo['attribute_vector'][attribute]['quantile_coverage'] = {};
    			var coveredQuantiles = 0; 
    			for (var i = 0; i < quantileList.length; i++) {
    				var quantVal = quantileList[i];
    				if (quantiles[quantVal] > 0) {
    					coveredQuantiles ++; 
    					currentLogInfo['attribute_vector'][attribute]['quantile_coverage'][quantVal] = true;
    				} else 
    					currentLogInfo['attribute_vector'][attribute]['quantile_coverage'][quantVal] = false;
    			}

    			var expectedCoveredQuantiles = ial.utils.getMarkovExpectedValue(numQuantiles, interactionSubset.length);
    			var percentUnique = coveredQuantiles / expectedCoveredQuantiles; 
    			currentLogInfo['attribute_vector'][attribute]['number_of_quantiles'] = numQuantiles; 
    			currentLogInfo['attribute_vector'][attribute]['covered_quantiles'] = coveredQuantiles; 
    			currentLogInfo['attribute_vector'][attribute]['expected_covered_quantiles'] = expectedCoveredQuantiles; 
    			if (interactionSubset.length == 0) // 100% unique if no interactions
    				percentUnique = 1;
    			currentLogInfo['attribute_vector'][attribute]['percentage'] = percentUnique;
    			// lower percent of unique interactions -> higher level of bias
    			var metricVal = 1.0 - Math.min(1, percentUnique);
    			if (metricVal > maxMetricValue) maxMetricValue = metricVal; 
    			currentLogInfo['attribute_vector'][attribute]['metric_level'] = metricVal;
    		} else if (this.attributeValueMap[attribute]['dataType'] == 'categorical') {
    			var quantiles = {};
    			var quantileList = Object.keys(fullDist);
    	
    			// figure out distribution of interactions
    			for (var i = 0; i < interactionSubset.length; i++) {
    				var attrVal = interactionSubset[i]['dataItem'][attribute];
    				if (quantiles.hasOwnProperty(attrVal))
    					quantiles[attrVal] += 1;
    				else quantiles[attrVal] = 1;
    			}
    			
    			currentLogInfo['attribute_vector'][attribute] = {};
    			currentLogInfo['attribute_vector'][attribute]['quantiles'] = quantileList;
    			currentLogInfo['attribute_vector'][attribute]['quantile_coverage'] = {};
    			var coveredQuantiles = 0; 
    			for (var i = 0; i < quantileList.length; i++) {
    				var quantVal = quantileList[i];
    				if (quantiles.hasOwnProperty(quantVal) && quantiles[quantVal] > 0) {
    					coveredQuantiles ++; 
    					currentLogInfo['attribute_vector'][attribute]['quantile_coverage'][quantVal] = true;
    				} else 
    					currentLogInfo['attribute_vector'][attribute]['quantile_coverage'][quantVal] = false;
    			}

    			var expectedCoveredQuantiles = ial.utils.getMarkovExpectedValue(quantileList.length, interactionSubset.length);
    			var percentUnique = coveredQuantiles / expectedCoveredQuantiles; 
    			currentLogInfo['attribute_vector'][attribute]['number_of_quantiles'] = quantileList.length; 
    			currentLogInfo['attribute_vector'][attribute]['covered_quantiles'] = coveredQuantiles; 
    			currentLogInfo['attribute_vector'][attribute]['expected_covered_quantiles'] = expectedCoveredQuantiles; 
    			if (interactionSubset.length == 0) // 100% unique if no interactions
    				percentUnique = 1;
    			currentLogInfo['attribute_vector'][attribute]['percentage'] = percentUnique;
    			// lower percent of unique interactions -> higher level of bias
    			var metricVal = 1.0 - Math.min(1, percentUnique);
    			if (metricVal > maxMetricValue) maxMetricValue = metricVal; 
    			currentLogInfo['attribute_vector'][attribute]['metric_level'] = metricVal;
    		}
    	}

    	currentLog['info'] = currentLogInfo;
    	// in this case, the metric level is the max metric value over all the attributes
    	currentLog['metric_level'] = maxMetricValue;

    	this.biasLogs.push(currentLog);
    	return currentLog;
    }
    
	// the attribute distribution metric relates to the shape of each attribute in the full distribution and in the distribution based on user interactions 
	// metric(a_m) = 1 - p, where p is defined as the probability of the Chi^2-statistic (categorial) or the KS-statistic (numerical)
    // Chi^2 = (observed - expected)^2 / expected
    // KS = largest difference in observed and expected cdf curves
 	// time (optional) the time frame of interactions to consider (defaults to all logged interactions)
	// interactionTypes (optional) limits scope of computation to particular interaction types or all if left unspecified
	ial.computeAttributeDistribution = function(time, interactionTypes) {
    	var interactionSubset = getInteractionQueueSubset(time, interactionTypes);

    	var currentLog = {};
    	currentLog['bias_type'] = this.BIAS_ATTRIBUTE_DISTRIBUTION;
    	currentLog['current_time'] = new Date();
    	currentLog['number_of_logs'] = interactionSubset.length;
    	currentLog['interaction_types'] = interactionTypes;
    	currentLog['time_window'] = time;
    	var currentLogInfo = {};
    	currentLogInfo['attribute_vector'] = {};
    	
    	// 0 if no interactions
        if (interactionSubset.length == 0) {
        	currentLog['info'] = currentLogInfo;
        	currentLog['metric_level'] = 0;
        	return currentLog;
        }

    	// compare interactions to full distribution of each attribute
    	var maxMetricVal = 0;
    	for (var attribute in this.attributeValueMap) {
    		fullDist = this.attributeValueMap[attribute]['distribution'];
    		if (this.attributeValueMap[attribute]['dataType'] == 'numeric') {
    			// figure out distribution of interactions
    			var intDist = [];
    			for (var i = 0; i < interactionSubset.length; i++) {
    				var curVal = interactionSubset[i]['dataItem'][attribute];
    				intDist.push(curVal); 
    			}
    			intDist.sort(function(a, b) {return a - b});
    			
    			var KS = getKSPercent(new Vector(fullDist), new Vector(intDist));
    			if (1 - Number(KS['p']) > maxMetricVal) maxMetricVal = 1 - Number(KS['p']);

    			currentLogInfo['attribute_vector'][attribute] = {};
    			currentLogInfo['attribute_vector'][attribute]['ks'] = KS['ks'];
    			currentLogInfo['attribute_vector'][attribute]['d'] = KS['d'];
    			currentLogInfo['attribute_vector'][attribute]['metric_level'] = 1 - KS['p'];
    		} else if (this.attributeValueMap[attribute]['dataType'] == 'categorical') {
    			var quantiles = {};
    			var quantileList = Object.keys(fullDist);
    			var chiSq = 0;
    	
    			// figure out distribution of interactions
    			for (var i = 0; i < interactionSubset.length; i++) {
    				var attrVal = interactionSubset[i]['dataItem'][attribute];
    				if (quantiles.hasOwnProperty(attrVal))
    					quantiles[attrVal] += 1;
    				else quantiles[attrVal] = 1;
    			}
    			
    			currentLogInfo['attribute_vector'][attribute] = {};
    			currentLogInfo['attribute_vector'][attribute]['quantiles'] = quantileList;
    			currentLogInfo['attribute_vector'][attribute]['quantile_distribution'] = {};
    			
    			var coveredQuantiles = 0; 
    			for (var i = 0; i < quantileList.length; i++) {
    				var quantVal = quantileList[i];
    				var expectedCount = interactionSubset.length * fullDist[quantVal] / this.dataSet.length;
    				currentLogInfo['attribute_vector'][attribute]['quantile_distribution'][quantVal] = {};
    				currentLogInfo['attribute_vector'][attribute]['quantile_distribution'][quantVal]['expected_count'] = expectedCount; 
        			var obsCount = 0;
    				if (quantiles.hasOwnProperty(quantVal))
    					obsCount = quantiles[quantVal];
    				currentLogInfo['attribute_vector'][attribute]['quantile_distribution'][quantVal]['observed_count'] = obsCount;
    				currentLogInfo['attribute_vector'][attribute]['quantile_distribution'][quantVal]['difference'] = obsCount - expectedCount;
    				chiSq += Math.pow(obsCount - expectedCount, 2) / expectedCount;
    			}
    			
    			var degFree = interactionSubset.length - 1;
        		var prob = getChiSquarePercent(chiSq, degFree); // emily: what should DoF be?
        		currentLogInfo['attribute_vector'][attribute]['degrees_of_freedom'] = degFree;
        		currentLogInfo['attribute_vector'][attribute]['chi_squared'] = chiSq;
    			currentLogInfo['attribute_vector'][attribute]['metric_level'] = prob;
    			if (prob > maxMetricVal) maxMetricVal = prob;
    		}
    	}

    	currentLog['info'] = currentLogInfo;
    	currentLog['metric_level'] = maxMetricVal;

    	this.biasLogs.push(currentLog);
    	return currentLog;
    }
    
	// the attribute weight coverage metric relates to the percentage of quantiles for each attribute weight covered by user interactions
	// metric(a_m) = 1 - min[1, (# unique quantiles interacted with) / (expected # unique quantiles interacted with)]
	// uses quantiles for weights; a value x falls in quantile i if q_i-1 < x <= q_i
	// time (optional) the time frame of interactions to consider (defaults to all logged interactions)
	// interactionTypes (optional) limits scope of computation to particular interaction types or all if left unspecified
	// numQuantiles (optional) number of quantiles to divide weights into
    ial.computeAttributeWeightCoverage = function(time, interactionTypes, numQuantiles) {
    	numQuantiles = typeof numQuantiles !== 'undefined' ? numQuantiles : 4;
    	var weightVectorSubset = getWeightVectorQueueSubset(time);

    	var currentLog = {};
    	currentLog['bias_type'] = this.BIAS_ATTRIBUTE_WEIGHT_COVERAGE;
    	currentLog['current_time'] = new Date();
    	currentLog['number_of_logs'] = weightVectorSubset.length;
    	currentLog['interaction_types'] = interactionTypes;
    	currentLog['time_window'] = time;
    	var currentLogInfo = {};
    	currentLogInfo['attribute_vector'] = {};
    	
    	var quantileMap = {}; // for counting number of weights that occur in each quantile
    	var changeMap = {}; // for counting number of times each attribute's weight actually changes with each new vector
    	for (var attribute in this.attributeValueMap) {
    		quantileMap[attribute] = {};
    		changeMap[attribute] = 1;
    	}
    	
    	// define quantiles
    	var quantileList = [];
    	for (var i = 0; i < numQuantiles; i++) { 
    		var quantVal;
			if (i != numQuantiles - 1)
				quantVal = this.minWeight + (i + 1) * (this.maxWeight - this.minWeight) / numQuantiles;
			else
				quantVal = this.maxWeight;
			quantileList.push(quantVal);
			for (var attribute in this.attributeValueMap)
				quantileMap[attribute][quantVal] = 0;
		}

    	// count quantiles interacted with for all the weight vectors
    	// only counts when the weight actually changed
		for (var i = 0; i < weightVectorSubset.length; i++) {
			var curWeightVector = weightVectorSubset[i];
			var oldVector = curWeightVector.oldWeight;
            var newVector = curWeightVector.newWeight;
            
            for (var attribute in this.attributeValueMap) {
            	// count which quantile the weight falls in
            	// if it's the first weight vector, check old vector and new vector
            	var attrWeight;
            	if (i == 0) {
            		attrWeight = oldVector[attribute];
            		// figure out which quantile it belongs to
                	var whichQuantile = ial.utils.getQuantile(quantileList, attrWeight);
                	quantileMap[attribute][whichQuantile] += 1;
            	}
            	
            	// for all other weight vectors, check if the weight actually changed
            	if (oldVector[attribute] != newVector[attribute]) {
            		changeMap[attribute] += 1;
	            	
	            	attrWeight = newVector[attribute];
	            	// figure out which quantile it belongs to
	            	var whichQuantile = ial.utils.getQuantile(quantileList, attrWeight);
	            	quantileMap[attribute][whichQuantile] += 1;
            	}
            }
		}
		
		// compute metric values
		var maxMetricValue = 0;
		for (var attribute in this.attributeValueMap) {
			currentLogInfo['attribute_vector'][attribute] = {};
			currentLogInfo['attribute_vector'][attribute]['quantiles'] = quantileList;
			currentLogInfo['attribute_vector'][attribute]['quantile_coverage'] = {};
			var coveredQuantiles = 0; 
			for (var i = 0; i < quantileList.length; i++) {
				var quantVal = quantileList[i];
				if (quantileMap[attribute][quantVal] > 0) {
					coveredQuantiles ++; 
					currentLogInfo['attribute_vector'][attribute]['quantile_coverage'][quantVal] = true;
				} else 
					currentLogInfo['attribute_vector'][attribute]['quantile_coverage'][quantVal] = false;
			}
	
			var expectedCoveredQuantiles = ial.utils.getMarkovExpectedValue(numQuantiles, changeMap[attribute]);
			var percentUnique = coveredQuantiles / expectedCoveredQuantiles; 
			currentLogInfo['attribute_vector'][attribute]['number_of_quantiles'] = numQuantiles; 
			currentLogInfo['attribute_vector'][attribute]['covered_quantiles'] = coveredQuantiles; 
			currentLogInfo['attribute_vector'][attribute]['expected_covered_quantiles'] = expectedCoveredQuantiles; 
			if (weightVectorSubset.length == 0) // 100% unique if no interactions
				percentUnique = 1;
			currentLogInfo['attribute_vector'][attribute]['percentage'] = percentUnique;
			// lower percent of unique interactions -> higher level of bias
			var metricVal = 1.0 - Math.min(1, percentUnique);
			if (metricVal > maxMetricValue) maxMetricValue = metricVal; 
			currentLogInfo['attribute_vector'][attribute]['metric_level'] = metricVal;
		}
		
    	currentLog['info'] = currentLogInfo;
    	// in this case, the metric level is the max metric value over all the attributes
    	currentLog['metric_level'] = maxMetricValue;

    	this.biasLogs.push(currentLog);
    	return currentLog;
    }
    
	// the attribute weight distribution metric relates to the shape of each attribute weights in the distribution based on user interactions compared to an exponential distribution
	// metric(a_m) = 1 - p, where p is defined as the probability of the KS-statistic
    // KS = largest difference in observed and expected curves
 	// time (optional) the time frame of interactions to consider (defaults to all logged interactions)
	// interactionTypes (optional) limits scope of computation to particular interaction types or all if left unspecified
	ial.computeAttributeWeightDistribution = function(time, interactionTypes) {
		var weightVectorSubset = getWeightVectorQueueSubset(time);

    	var currentLog = {};
    	currentLog['bias_type'] = this.BIAS_ATTRIBUTE_WEIGHT_DISTRIBUTION;
    	currentLog['current_time'] = new Date();
    	currentLog['number_of_logs'] = weightVectorSubset.length;
    	currentLog['interaction_types'] = interactionTypes;
    	currentLog['time_window'] = time;
    	var currentLogInfo = {};
    	currentLogInfo['attribute_vector'] = {};
    	
    	// 0 if no interactions
        if (weightVectorSubset.length == 0) {
        	currentLog['info'] = currentLogInfo;
        	currentLog['metric_level'] = 0;
        	return currentLog;
        }

    	// exponential distribution sampled N+1 times between 0 and (max weight - min weight)
        var expDistr = [];
        for (var i = 0; i <= this.dataSet.length; i++) {
        	var xVal = i * Math.abs(this.maxWeight - this.minWeight) / this.dataSet.length;
        	expDistr.push(Math.exp(-1 * xVal));
        }
        
        // compute the distributions of delta weight (change in weight)
        var weightDistr = {};
        for (var attribute in this.attributeValueMap) {
        	var curDistr = [];
        	for (var i = 0; i < weightVectorSubset.length; i++)
        		curDistr.push(Math.abs(weightVectorSubset[i].newWeight[attribute] - weightVectorSubset[i].oldWeight[attribute]));
        	weightDistr[attribute] = curDistr;
        }
        
        // compare delta weight distributions to exponential distribution
    	var maxMetricVal = 0;
    	for (var attribute in this.attributeValueMap) {
    		var KS = { ks: undefined, d: undefined, p: 0 };
    		if (weightDistr[attribute] > 0)
    			KS = getKSPercent(new Vector(expDistr), new Vector(weightDistr[attribute]));
    		
    		if (typeof KS['p'] == undefined) KS['p'] = 0;
    		if (1 - Number(KS['p']) > maxMetricVal) maxMetricVal = 1 - Number(KS['p']);

    		currentLogInfo['attribute_vector'][attribute] = {};
    		currentLogInfo['attribute_vector'][attribute]['ks'] = KS['ks'];
    		currentLogInfo['attribute_vector'][attribute]['d'] = KS['d'];
    		currentLogInfo['attribute_vector'][attribute]['metric_level'] = 1 - KS['p'];
    	}

    	currentLog['info'] = currentLogInfo;
    	currentLog['metric_level'] = maxMetricVal;

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

    /*
     * Clone an object
     */
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
    
    /*
     * Returns the expected number of unique items visited in k 
     * interactions for a set of size N
     */
    ial.utils.getMarkovExpectedValue = function(N, k) {
    	var num = Math.pow(N, k) - Math.pow((N-1), k);
    	var denom = Math.pow(N, (k-1));
    	return num / denom; 
    }
    
    /*
     * Returns the quantile in which the given value belongs
     */
    ial.utils.getQuantile = function(quantileList, value) {
    	for (var i = 0; i < quantileList.length; i++) {
			var quantVal = quantileList[i];
			if (i == 0) {
				if (value <= quantVal) 
					return quantVal;
			} else {
				if (value <= quantVal && value > quantileList[i - 1]) 
					return quantVal;
			}
		}
    	return -1; 
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
    	
    	if (f <= 0) Fcdf = 0;
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
    
    // private
    // get the percent probability given the two distributions
    // TODO: taken from jerzy library -- figure out how to integrate Node.js to use library directly
    function getKSPercent(x, y) {
    	var all = new Vector(x.elements.concat(y.elements)).sort();
    	var ecdfx = x.ecdf(all);
    	var ecdfy = y.ecdf(all);
    	var d = ecdfy.subtract(ecdfx).abs().max();
    	var n = (x.length() * y.length()) / (x.length() + y.length());
    	var ks = Math.sqrt(n) * d;
    	var p = 1 - new Kolmogorov().distr(ks);

    	return {
    		"d": d,
    		"ks": ks,
    		"p": p
    	};
    }
    
    /** Jerzy vector **/
    
    Vector = function(elements) {
    	this.elements = elements;
    };

    Vector.prototype.push = function(value) {
    	this.elements.push(value);
    };

    Vector.prototype.map = function(fun) {
    	return new Vector(this.elements.map(fun));
    };

    Vector.prototype.length = function() {
    	return this.elements.length;
    };

    Vector.prototype.concat = function(x) {
    	return new Vector(this.elements.slice(0).concat(x.elements.slice(0)));
    };

    Vector.prototype.abs = function() {
    	var values = [];
    	for (var i = 0; i < this.elements.length; i++) {
    		values.push(Math.abs(this.elements[i]));
    	}
    	return new Vector(values);
    };

    Vector.prototype.dot = function(v) {
    	var result = 0;
    	for (var i = 0; i < this.length(); i++) {
    		result = result + this.elements[i] * v.elements[i];
    	}
    	return result;
    };

    Vector.prototype.sum = function() {
    	var sum = 0;
    	for (var i = 0, n = this.elements.length; i < n; ++i) {
    		sum += this.elements[i];
    	}
    	return sum;
    };

    Vector.prototype.log = function() {
    	var result = new Vector(this.elements.slice(0));
    	for (var i = 0, n = this.elements.length; i < n; ++i) {
    		result.elements[i] = Math.log(result.elements[i]);
    	}
    	return result;
    };

    Vector.prototype.add = function(term) {
    	var result = new Vector(this.elements.slice(0));
    	if (term instanceof Vector) {
    		for (var i = 0, n = result.elements.length; i < n; ++i) {
    			result.elements[i] += term.elements[i];
    		}
    	} else {
    		for (var i = 0, n = result.elements.length; i < n; ++i) {
    			result.elements[i] += term;
    		}
    	}
    	return result;
    };

    Vector.prototype.subtract = function(term) {
    	return this.add(term.multiply(-1));
    };

    Vector.prototype.multiply = function(factor) {
    	var result = new Vector(this.elements.slice(0));
    	if (factor instanceof Vector) {
    		for (var i = 0, n = result.elements.length; i < n; ++i) {
    			result.elements[i] = result.elements[i] * factor.elements[i];
    		}
    	} else {
    		for (var i = 0, n = result.elements.length; i < n; ++i) {
    			result.elements[i] = result.elements[i] * factor;
    		}
    	}
    	return result;
    };

    Vector.prototype.pow = function(p) {
    	var result = new Vector(this.elements.slice(0));
    	if (p instanceof Vector) {
    		for (var i = 0, n = result.elements.length; i < n; ++i) {
    			result.elements[i] = Math.pow(result.elements[i], p.elements[i]);
    		}
    	} else {
    		for (var i = 0, n = result.elements.length; i < n; ++i) {
    			result.elements[i] = Math.pow(result.elements[i], p);
    		}
    	}
    	return result;
    };

    Vector.prototype.mean = function() {
    	var sum = 0;
    	for (var i = 0, n = this.elements.length; i < n; ++i) {
    		sum += this.elements[i];
    	}
    	return sum / this.elements.length;
    };

    Vector.prototype.median = function() {
    	var sorted = this.sort();
    	var middle = Math.floor(sorted.length() / 2);
    	if (sorted.length() % 2) {
    		return sorted.elements[middle];
    	} else {
    		return (sorted.elements[middle - 1] + sorted.elements[middle]) / 2;
    	}
    };

    Vector.prototype.q1 = function() {
    	var sorted = this.sort();
    	var middle = Math.floor(sorted.length() / 2);
    	var e = sorted.slice(0, middle);
    	console.log(e);
    	return e.median();
    };

    Vector.prototype.q3 = function() {
    	var sorted = this.sort();
    	var middle = Math.ceil(sorted.length() / 2);
    	var e = sorted.slice(middle);
    	return e.median();
    };

    Vector.prototype.slice = function(start, end) {
        if (typeof end === "undefined") {
            return new Vector(this.elements.slice(start));
        } else {
        	return new Vector(this.elements.slice(start, end));
        }
    };

    Vector.prototype.geomean = function() {
    	return Math.exp(this.log().sum() / this.elements.length);
    };

    Vector.prototype.sortElements = function() {
    	var sorted = this.elements.slice(0);
    	for (var i = 0, j, tmp; i < sorted.length; ++i) {
    		tmp = sorted[i];
    		for (j = i - 1; j >= 0 && sorted[j] > tmp; --j) {
    			sorted[j + 1] = sorted[j];
    		}
    		sorted[j + 1] = tmp;
    	}
    	return sorted;
    };

    Vector.prototype._ecdf = function(x) {
    	var sorted = this.sortElements();
    	var count = 0;
    	for (var i = 0; i < sorted.length && sorted[i] <= x; i++) {
    		count++;	
    	}
    	return count / sorted.length;
    };

    Vector.prototype.ecdf = function(arg) {
    	if (arg instanceof Vector) {
    		var result = new Vector([]);
    		for (var i = 0; i < arg.length(); i++) {
    			result.push(this._ecdf(arg.elements[i]));
    		}
    		return result;
    	} else {
    		return this._ecdf(arg);
    	}
    };

    Vector.prototype.sort = function() {
    	return new Vector(this.sortElements());
    };

    Vector.prototype.min = function() {
    	return this.sortElements()[0];
    };

    Vector.prototype.max = function() {
    	return this.sortElements().pop();
    };

    Vector.prototype.toString = function() {
    	return "[" + this.elements.join(", ") + "]";
    };

    /*
     * unbiased sample variance
     */

    Vector.prototype.variance = function() {
    	return this.ss() / (this.elements.length - 1);
    };

    /*
     * biased sample variance
     */

    Vector.prototype.biasedVariance = function() {
    	return this.ss() / this.elements.length;
    };

    /*
     * corrected sample standard deviation
     */

    Vector.prototype.sd = function() {
    	return Math.sqrt(this.variance());
    };

    /*
     * uncorrected sample standard deviation
     */

    Vector.prototype.uncorrectedSd = function() {
    	return Math.sqrt(this.biasedVariance());
    };

    /*
     * standard error of the mean
     */

     Vector.prototype.sem = function() {
     	return this.sd() / Math.sqrt(this.elements.length);
     };

    /*
     * total sum of squares
     */

    Vector.prototype.ss = function() {
    	var m = this.mean();
    	var sum = 0;
    	for (var i = 0, n = this.elements.length; i < n; ++i) {
    		sum += Math.pow(this.elements[i] - m, 2);
    	}
    	return sum;
    };

    /*
     * residuals
     */

    Vector.prototype.res = function() {
    	return this.add(-this.mean());
    };

    Vector.prototype.kurtosis = function() {
    	return this.res().pow(4).mean() / Math.pow(this.res().pow(2).mean(), 2);
    };

    Vector.prototype.skewness = function() {
    	return this.res().pow(3).mean() / Math.pow(this.res().pow(2).mean(), 3 / 2);
    };

    Sequence.prototype = new Vector();

    Sequence.prototype.constructor = Sequence;

    function Sequence(min, max, step) {
    	this.elements = [];
    	for (var i = min; i <= max; i = i + step) {
    		this.elements.push(i);
    	}
    };
    
    /** Statistic Distribution Utility Functions **/
    
    Kolmogorov = function() {};

    Kolmogorov.prototype._di = function(x) {
    	var term;
    	var sum = 0;
    	var k = 1;
    	do {
    		term = Math.exp(-Math.pow(2 * k - 1, 2) * Math.pow(Math.PI, 2) / (8 * Math.pow(x, 2)));
    		sum = sum + term;
    		k++;
    	} while (Math.abs(term) > 0.000000000001);
    	return Math.sqrt(2 * Math.PI) * sum / x;
    };

    Kolmogorov.prototype.distr = function(arg) {
            if (arg instanceof Vector) {
                    result = new Vector([]);
                    for (var i = 0; i < arg.length(); ++i) {
                            result.push(this._di(arg.elements[i]));
                    }
                    return result;
            } else {
                    return this._di(arg);
            }
    };

    Kolmogorov.prototype.inverse = function(x) {
    	return (function (o, x) {
    		var t = numeric.Numeric.bisection(function(y) {
    			return o._di(y) - x;
    		}, 0, 1);
    		return t;
    	})(this, x);
    };
    
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
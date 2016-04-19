/**
 * Created by arjun010 on 12/28/15.
 */
(function() {
    ial = {};
    this.ialIdToDataMap  = {};
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
        this.attributeValueMap = {}; //will hold min, max and data types (may need more work for data types)
        this.activeAttributeCount = 0;
        this.sessionLogs = [];


        /*
        * initializing attributeWeightVector and attributeValueMap
        * */
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

                    if (!isNaN(passedData[0][attribute])){
                        this.attributeValueMap[attribute] = {
                            'min': parseFloat(passedData[0][attribute]),
                            'max': parseFloat(passedData[0][attribute]),
                            'dataType': 'numeric'
                        };
                    }else{ // need to change this part to handle categorical values
                        this.attributeValueMap[attribute] = {
                            'min': passedData[0][attribute],
                            'max': passedData[0][attribute],
                            'dataType': 'categorical'
                        };
                    }
                }
            }
        }
        if(normalizeAttributeWeights==1){
            this.useNormalizedAttributeWeights = 1;
            ial.normalizeAttributeWeightVector();
        }else{
            this.useNormalizedAttributeWeights = 0;
        }

        for (var index in passedData) {
            this.dataSet[index]["ial"] = {};
            this.dataSet[index]["ial"]["id"] = index;
            this.dataSet[index]["ial"]["weight"] = 1;
            this.ialIdToDataMap[index] = this.dataSet[index];

            /*
            * Finding min max for all attributes
            * */
            var dataItem = passedData[index];
            for(var attribute in this.attributeValueMap){
                if(!isNaN(dataItem[attribute])){
                    var curValue = parseFloat(dataItem[attribute]);
                    if(curValue<this.attributeValueMap[attribute]['min']){
                        this.attributeValueMap[attribute]['min'] = curValue;
                    }
                    if(curValue>this.attributeValueMap[attribute]['max']){
                        this.attributeValueMap[attribute]['max'] = curValue;
                    }
                }else{ // need to change this part to handle categorical values
                    if(dataItem[attribute]<this.attributeValueMap[attribute]['min']){
                        this.attributeValueMap[attribute]['min'] = dataItem[attribute];
                    }
                    if(dataItem[attribute]>this.attributeValueMap[attribute]['max']){
                        this.attributeValueMap[attribute]['max'] = dataItem[attribute];
                    }
                }
            }
        }
        for(var index in passedData){
            this.dataSet[index]["ial"]["itemScore"] = parseFloat(getItemScore(this.ialIdToDataMap[index],this.attributeWeightVector));
        }
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
        }
        console.log(logObj)
    };

    // returns the current attributeValueMap
    ial.getAttributeValueMap = function(){
        return clone(this.attributeValueMap);
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
        return clone(this.attributeWeightVector);
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
            ial.normalizeAttributeWeightVector();
        }
        ial.updateActiveAttributeCount();

        if(additionalLogInfoMap!={}){
            logObj.setCustomLogInfo(additionalLogInfoMap);
        }
        if(logEvent==true){
            this.sessionLogs.push(logObj);
        }

        logObj.setNewWeight(this.attributeWeightVector[attribute]);
        ial.updateItemScores();
    };

    /*
    * Increments attribute's weight by increment. Checks to ensure that the weight is always in [0.0,1.0]
    * */
    ial.updateAttributeWeight = function(attribute,increment,logEvent,additionalLogInfoMap){
        logEvent = typeof logEvent !== 'undefined' ? logEvent : false;
        additionalLogInfoMap = typeof additionalLogInfoMap !== 'undefined' ? additionalLogInfoMap : {};

        var logObj = new LogObj(attribute);
        logObj.setOldWeight(this.attributeWeightVector[attribute]);
        logObj.setEventName('AttributeWeightChange_UPDATE');

        var newWeight = this.attributeWeightVector[attribute]+increment;

        if(this.useNormalizedAttributeWeights==0) {
            if (newWeight > 1.0) {
                this.attributeWeightVector[attribute] = 1.0;
            } else if (newWeight < 0.0) {
                this.attributeWeightVector[attribute] = 0.0;
            } else {
                this.attributeWeightVector[attribute] = newWeight;
            }
        }else{
            ial.normalizeAttributeWeightVector();
        }
        ial.updateActiveAttributeCount();


        if(additionalLogInfoMap!={}){
            logObj.setCustomLogInfo(additionalLogInfoMap);
        }
        if(logEvent==true){
            this.sessionLogs.push(logObj);
        }

        logObj.setNewWeight(this.attributeWeightVector[attribute]);
        ial.updateItemScores();
    };

    /*
    * Sets the attribute weight vector to the newly passed map
    * */
    ial.setAttributeWeightVector = function(newAttributeWeightVector){
        this.attributeWeightVector = clone(newAttributeWeightVector);
        for(var attribute in this.attributeWeightVector){
            if(this.attributeWeightVector[attribute]>1.0){
                this.attributeWeightVector[attribute] = 1.0
            }
            if(this.attributeWeightVector[attribute]<0.0){
                this.attributeWeightVector[attribute] = 0.0
            }
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

        var logObj = new LogObj();
        logObj.setOldWeight(clone(this.attributeWeightVector));
        logObj.setEventName('AttributeWeightChange_RESET');

        for(var attribute in this.attributeWeightVector){
            this.attributeWeightVector[attribute] = 1.0;
        }


        if(additionalLogInfoMap!={}){
            logObj.setCustomLogInfo(additionalLogInfoMap);
        }
        if(logEvent==true){
            this.sessionLogs.push(logObj);
        }
        ial.updateActiveAttributeCount();

        if(this.useNormalizedAttributeWeights==1){
            ial.normalizeAttributeWeightVector();
        }
        logObj.setNewWeight(clone(this.attributeWeightVector));
        ial.updateItemScores();
    };

    /*
    * Nullifies attributeWeightVector to 0.0s
    * */
    ial.nullifyAttributeWeightVector = function (logEvent,additionalLogInfoMap) {

        logEvent = typeof logEvent !== 'undefined' ? logEvent : false;
        additionalLogInfoMap = typeof additionalLogInfoMap !== 'undefined' ? additionalLogInfoMap : {};

        var logObj = new LogObj();
        logObj.setOldWeight(clone(this.attributeWeightVector));
        logObj.setEventName('AttributeWeightChange_NULLIFY');

        for(var attribute in this.attributeWeightVector){
            this.attributeWeightVector[attribute] = 0.0;
        }

        logObj.setNewWeight(clone(this.attributeWeightVector));
        if(additionalLogInfoMap!={}){
            logObj.setCustomLogInfo(additionalLogInfoMap);
        }
        if(logEvent==true){
            this.sessionLogs.push(logObj);
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
        console.log(clone(tempAttributeWeightVector));
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

        //---------------------------
        // old difference based logic
        //---------------------------
        /*
        for(var attribute in this.attributeWeightVector){
            var val1 = this.getNormalizedAttributeValue(points[0][attribute],attribute);
            var val2 = this.getNormalizedAttributeValue(points[1][attribute],attribute);
            if(this.attributeValueMap[attribute]['dataType']!='categorical'){
                var diff = Math.abs(val1-val2);
                tempAttributeWeightVector[attribute] = 1.0-diff;
            }else{
                if(val1 == val2){
                    tempAttributeWeightVector[attribute] = 1.0;
                }else{
                    tempAttributeWeightVector[attribute] = 0.0;
                }
            }
        }
        console.log(tempAttributeWeightVector)
        */

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
        if (typeof points2 !== 'undefined') { 
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
            //console.log(clone(tempAttributeWeightVector));
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
        this.customLogInfo = clone(customLogInfoMap);
    };


    /*
    * ---------------------
    *   Utility functions
    * ---------------------
    * */

    function clone(obj) {
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
                copy[i] = clone(obj[i]);
            }
            return copy;
        }

        // Handle Object
        if (obj instanceof Object) {
            var copy = {};
            for (var attr in obj) {
                if (obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
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
})();
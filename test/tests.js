/*
* All tests go here.
* */
(function () {

    var testData = [
        {
        	"name":"item1",
            "attribute1":10,
            "attribute2":20,
            "attribute3":"Type1"
        },
        {
        	"name":"item2",
            "attribute1":30,
            "attribute2":5,
            "attribute3":"Type2"
        }, 
        {
        	"name":"item3",
        	"attribute1":40,
        	"attribute2":10,
        	"attribute3":"Type2"
        },
        {
        	"name":"item4",
        	"attribute1":5,
        	"attribute2":35,
        	"attribute3":"Type2"
        }
    ];

    initTest();
    biasTest(); 
    // dataAdditionTest();
    // dataDeletionTest();

    function initTest() {
        ial.init(testData, undefined, ["name"], "exclude");
        console.log(ial.getData());
    }
    
    function biasTest() {
    	console.log("Attribute value map", ial.getAttributeValueMap());
    	// create the interaction logs
    	var interactionLogs = [
    	                       {
    	                    	   "dataItem":testData[0],
    	                    	   "oldWeight":1,
    	                    	   "newWeight":3,
    	                    	   "eventTimeStamp":new Date("July 14, 2016 09:44:00"),
    	                    	   "eventName":"ItemWeightChange_UPDATE",
    	                    	   "customLogInfo":{
    	                    		   "eventType":"single_click"
    	                    	   }
    	                       },
    	                       {"dataItem":testData[0],
    	                    	   "oldWeight":3,
    	                    	   "newWeight":5,
    	                    	   "eventTimeStamp":new Date("July 14, 2016 09:44:10"),
    	                    	   "eventName":"ItemWeightChange_UPDATE",
    	                    	   "customLogInfo":{
    	                    		   "eventType":"single_click"
    	                    	   }
    	                       },
    	                       {"dataItem":testData[2],
    	                    	   "oldWeight":1,
    	                    	   "newWeight":2,
    	                    	   "eventTimeStamp":new Date("July 14, 2016 09:44:20"),
    	                    	   "eventName":"ItemWeightChange_UPDATE",
    	                    	   "customLogInfo":{
    	                    		   "eventType":"hover"
    	                    	   }
    	                       }
    	                      ];
    	
    	for (var i = 0; i < interactionLogs.length; i++) ial.log.enqueue(interactionLogs[i]);
    	console.log("Interactions enqueued", ial.log.getItemLogs());
    	
    	// create the attribute weight logs
    	var weightVector1 = {
	    		"attribute1":0.3,
	    		"attribute2":0.4,
	    		"attribute3":0.3
    		};
    	var weightVector2 = {
        		"attribute1":0.4,
        		"attribute2":0.3,
        		"attribute3":0.3
        	};
    	var weightVector3 = {
        		"attribute1":0.6,
        		"attribute2":0.2,
        		"attribute3":0.2
        	};
    	var attributeWeightLogs = [
    	                           {
    	                        	   "dataItem":weightVector1,
    	                        	   "eventName":"AttributeWeightChange_UPDATE",
    	                        	   "oldWeight":weightVector1,
    	                        	   "newWeight":weightVector2,
    	                        	   "eventTimeStamp":new Date("July 14, 2016 09:44:30"),
    	                        	   "customLogInfo":{
    	                    		   		"eventType":"weight_update"
    	                    	   		}
    	                           },
    	                           {
    	                        	   "dataItem":weightVector2,
    	                        	   "eventName":"AttributeWeightChange_UPDATE",
    	                        	   "oldWeight":weightVector2,
    	                        	   "newWeight":weightVector3,
    	                        	   "eventTimeStamp":new Date("July 14, 2016 09:44:30"),
    	                        	   "customLogInfo":{
    	                    		   		"eventType":"weight_update"
    	                    	   		}
    	                           }
    	                          ];
    	
    	for (var i = 0; i < attributeWeightLogs.length; i++) ial.log.enqueue(attributeWeightLogs[i]);
    	console.log("Attribute weight logs enqueued", ial.log.getAttributeLogs());
    	
    	// test the bias metrics
    	var dPC = ial.usermodel.bias.computeDataPointCoverage();
    	console.log("Data Point Coverage Metric", dPC);
    	var dPD = ial.usermodel.bias.computeDataPointDistribution();
    	console.log("Data Point Distribution Metric", dPD);
    	var aC = ial.usermodel.bias.computeAttributeCoverage();
    	console.log("Attribute Coverage Metric", aC);
    	var aD = ial.usermodel.bias.computeAttributeDistribution();
    	console.log("Attribute Distribution Metric", aD);
    	var aWC = ial.usermodel.bias.computeAttributeWeightCoverage();
    	console.log("Attribute Weight Coverage Metric", aWC);
    	var aWD = ial.usermodel.bias.computeAttributeWeightDistribution();
    	console.log("Attribute Weight Distribution Metric", aWD);
    }

    function dataAdditionTest() {
        ial.init(testData);
        var newDataPoints = [
            {
                "attribute1":10,
                "name":"item3",
                "attribute2":5,
                "attribute3":"Type2"
            }
        ];
        ial.addData(newDataPoints);
        console.log(testData);
    }

    function dataDeletionTest() {
        ial.init(testData);
        ial.deleteItem(testData[0]);
        console.log(testData);
    }

})();
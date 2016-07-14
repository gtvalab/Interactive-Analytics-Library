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
    	
    	for (var i = 0; i < interactionLogs.length; i++) ial.interactionEnqueue(interactionLogs[i]);
    	console.log("Interactions enqueued", ial.getInteractionQueue());
    	
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
    	                        	   "eventTimeStamp":new Date("July 14, 2016 09:44:30")
    	                           },
    	                           {
    	                        	   "dataItem":weightVector2,
    	                        	   "eventName":"AttributeWeightChange_UPDATE",
    	                        	   "oldWeight":weightVector2,
    	                        	   "newWeight":weightVector3,
    	                        	   "eventTimeStamp":new Date("July 14, 2016 09:44:30")
    	                           }
    	                          ];
    	
    	for (var i = 0; i < attributeWeightLogs.length; i++) ial.attributeWeightVectorEnqueue(attributeWeightLogs[i]);
    	console.log("Attribute weight logs enqueued", ial.getAttributeWeightVectorQueue());
    	
    	// test the bias metrics
    	var subsetRes = ial.computeSubsetBias(); 
    	console.log("Subset metric", subsetRes);
    	var varRes = ial.computeVarianceBias();
    	console.log("Variance metric", varRes);
    	var repRes = ial.computeRepetitionBias();
    	console.log("Repetition metric", repRes);
    	var attrRes = ial.computeAttributeWeightBias();
    	console.log("Attribute Weight metric", attrRes);
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
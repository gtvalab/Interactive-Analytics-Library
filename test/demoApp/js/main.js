/**
 * Created by arjun010 on 12/21/15.
 */
(function() {
    var bugout = new debugout(); 
    bugout.autoTrim = false; 
    main = {};
    var svg, points;
    var dataSet;
    var timer;
    var color = d3.scale.category20();

    var dataCSV = "data/cars_2004.csv";
    var coloringAttribute = "Type";
    var interestPointsList = [];


    //var dataCSV = "data/irisDb.csv";
    //var coloringAttribute = "species";


    var carList = [];
    var activeClusterList = [];


    var tip;
    var sizeScale = d3.scale.linear().domain([1,8]).range([2,7]);
    var firstopeneForInteractionPanel = -1, clickSliderObj,dblClickSliderObj,hoverSliderObj, firstOpenForAttributeWeightVector=-1;
    var hoverWeight=0,clickWeight=1,dblClickWeight=2;
    var attributeWeightVectorSliderObjMap = {};

    var barWidthToAttributeWeightScale = d3.scale.linear().domain([3,180]).range([0,1]).clamp(true);
    var attributeWeightToBarWidthScale = d3.scale.linear().domain([0,1]).range([3,180]).clamp(true);


    main.init = function(params) {
        for(var i = 1;i<51;i++){
            $("#topNValue").append($('<option></option>').attr("value", i).text(i));
            $("#NSimilarPointsValue").append($('<option></option>').attr("value", i).text(i));
        }
        //main.populateCarList();
         main.initializeIAL(); 
    };

    main.populateCarList = function (){
        d3.csv(dataCSV, function(error, data) {
            var carName;
            data.map(function(d,i){
                carName = d['Name'];
                carList.push(carName);
                //$("#similarPointsFocusPoint").append($('<option></option>').attr("value", carName).text(carName));
                //$("#similarPointsFocusPoint").append($('<option></option>').attr("value", carName).text(carName));
                $("#attributeGeneratingFocusPoint1").append($('<option></option>').attr("value", carName).text(carName));
                $("#attributeGeneratingFocusPoint2").append($('<option></option>').attr("value", carName).text(carName));
                $("#attributeGeneratingFocusPoint3").append($('<option></option>').attr("value", carName).text(carName));
            });
            //$("#similarPointsFocusPoint").selectpicker('refresh');
            $("#attributeGeneratingFocusPoint1").selectpicker('refresh');
            $("#attributeGeneratingFocusPoint2").selectpicker('refresh');
            $("#attributeGeneratingFocusPoint3").selectpicker('refresh');

            main.initializeIAL(); 
        });
    };

    main.initializeIAL = function(){
        d3.csv(dataCSV, function(error, data) {
            dataSet = data;
            ial.init(data,0,['Name'],'exclude');
            //ial.setMaxQueueSize(5);
            var headerNames = d3.keys(data[0]);
            tip = d3.tip()
                .attr('class', 'd3-tip')
                .offset([-10, 0])
                .html(function(d) {
                    return "<span style='color:gold'>" + d.Name+ "</span><br>";
                });

            main.initializeVis(params.width, params.height);
        });
    };

    main.initializeVis = function(width, height){
        var margin = {top: 40, right: 20, bottom: 20, left: 40},
            width = width - margin.left - margin.right,
            height = height - margin.top - margin.bottom;

        svg = d3.select("#vis").append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g")
            .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

        svg.call(tip);

        //console.log(dataSet);

        points = svg.selectAll(".dot")
            .data(dataSet)
            .enter().append("circle")
            .attr("class", "dot")
            .attr("r", function (d) {
                return 4;
            })
            .attr("cx", function(d) {
                return 0;
            })
            .attr("cy", function(d) {
                return 0;
            })
            .style("opacity", 0);

        populateAttributeWeightDiv();
        main.drawPCA(params.width, params.height);
    };

    main.drawPCA = function(width, height) {

        d3.select('.x.axis').remove();
        d3.select('.y.axis').remove();
        var margin = {top: 40, right: 20, bottom: 20, left: 40},
            width = width - margin.left - margin.right,
            height = height - margin.top - margin.bottom;

        var x = d3.scale.linear()
            .range([0, width]);

        var y = d3.scale.linear()
            .range([height, 0]);

        var xAxis = d3.svg.axis()
            .scale(x)
            .orient("bottom");

        var yAxis = d3.svg.axis()
            .scale(y)
            .orient("left");
        var matrix = [];
        dataSet.map(function(d){
            d = d3.values(d);
            d = d.slice(2,d.length-1).map(parseFloat);
            matrix.push(d);
        });

        var pca = new PCA();
        matrix = pca.scale(matrix,true,true);
        pc = pca.pca(matrix,2);

        var pcaMap = {};

        dataSet.map(function(d,i){
            pcaMap[d.Name] = {
                'pc1':-1,
                'pc2':-1
            };
            pcaMap[d.Name]['pc1'] = pc[i][0];
            pcaMap[d.Name]['pc2']= pc[i][1];
        });


        x.domain(d3.extent(dataSet, function(d) { return pcaMap[d.Name].pc1; })).nice();
        y.domain(d3.extent(dataSet, function(d) { return pcaMap[d.Name].pc2; })).nice();

        svg.append("g")
            .attr("class", "x axis")
            .attr("transform", "translate(0," + height + ")")
            .call(xAxis)
            .append("text")
            .attr("class", "label")
            .attr("x", width)
            .attr("y", -6)
            .style("text-anchor", "end")
            .text("PC1");

        svg.append("g")
            .attr("class", "y axis")
            .call(yAxis)
            .append("text")
            .attr("class", "label")
            .attr("transform", "rotate(-90)")
            .attr("y", 6)
            .attr("dy", ".71em")
            .style("text-anchor", "end")
            .text("PC2")

        points.transition()
            .duration(1000)
            .attr("class", "dot")
            .attr("r", function (d) {
                return 4;
            })
            .attr("cx", function(d) {
                return x(pcaMap[d.Name]['pc1']);
            })
            .attr("cy", function(d) {
                return y(pcaMap[d.Name]['pc2']);
            })
            .style("fill", function(d) {return color(d[coloringAttribute]); })
            .style("opacity", 1);

        d3.selectAll('.dot').on('click', function (d) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(function() {
                if(typeof(clickSliderObj) != 'undefined'){
                    clickWeight = clickSliderObj.value();
                }
                ial.incrementItemWeight(d,clickWeight,true,{'level':'INFO','eventType':'single_click'});
                $("#similarPointsFocusPoint").text(d.Name);
                showDetails(d);
            }, 250);
            })
            .on('dblclick', function(d){
                clearTimeout(timer);
                if(typeof(dblClickSliderObj) != 'undefined'){
                    dblClickWeight = dblClickSliderObj.value();
                }
                ial.incrementItemWeight(d,dblClickWeight,true,{'level':'INFO','eventType':'double_click'});
                addInterestPoint(d.Name);
            })
            .on('mouseover', function (d) {
                if(typeof(hoverSliderObj) != 'undefined'){
                    hoverWeight = hoverSliderObj.value();
                }
                ial.incrementItemWeight(d,hoverWeight,true,{'level':'INFO','eventType':'hover'});
                tip.show(d);
            })
            .on('mouseout', tip.hide);
    };

    main.drawKNN = function (width,height,clusters) {

        d3.select('.x.axis').remove();
        d3.select('.y.axis').remove();

        var idToPosMap = {};
        var clusterCenters = [];
        var coveredPositions = [];
        var newX = getRandomNumber(50, width-100);
        var newY = getRandomNumber(50, height-100);
        var newPos = {
            'x': newX,
            'y': newY
        };
        for (var i in clusters) {
            while (coveredPositions.indexOf(newPos) > -1) {
                newX = getRandomNumber(65, width-100);
                newY = getRandomNumber(65, height-100);
                newPos = {
                    'x': newX,
                    'y': newY
                };
            }
            coveredPositions.push(newPos);
            clusterCenters.push(newPos);
        }
        coveredPositions = [];
        for (var i in clusters) {
            var dataPoints = clusters[i]['dataItems'];
            var curClusterCenter = clusterCenters[i];
            //console.log(curClusterCenter);
            for (var pointIndex in dataPoints) {
                var curDataPoint = dataPoints[pointIndex];
                newX = getRandomNumber(curClusterCenter.x - 50, curClusterCenter.x + 50);
                newY = getRandomNumber(curClusterCenter.y - 50, curClusterCenter.y + 50);
                newPos = {
                    'x': newX,
                    'y': newY
                };
                while (coveredPositions.indexOf(newPos) > -1) {
                    newX = getRandomNumber(curClusterCenter.x - 50, curClusterCenter.x + 50);
                    newY = getRandomNumber(curClusterCenter.y - 50, curClusterCenter.y + 50);
                    newPos = {
                        'x': newX,
                        'y': newY
                    };
                }
                coveredPositions.push(newPos);
                //curDataPoint.x = newPos.x;
                //curDataPoint.y = newPos.y;
                idToPosMap[curDataPoint.ial.id] = {'x':newPos.x,'y':newPos.y};
            }
        }

        points.transition()
            .duration(1000)
            .attr("class", "dot")
            .attr("r", function (d) {
                return 4;
            })
            .attr("cx", function(d) {
                return idToPosMap[d.ial.id].x;
            })
            .attr("cy", function(d) {
                return idToPosMap[d.ial.id].y;
            })
            .style("opacity", 1);

        d3.selectAll('.dot').on('click', function (d) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(function() {
                if(typeof(clickSliderObj) != 'undefined'){
                    clickWeight = clickSliderObj.value();
                }
                ial.incrementItemWeight(d,clickWeight,true,{'level':'INFO','eventType':'single_click'});
                $("#similarPointsFocusPoint").text(d.Name);
                showDetails(d);
            }, 250);
            })
            .on('dblclick', function(d){
                clearTimeout(timer);
                if(typeof(dblClickSliderObj) != 'undefined'){
                    dblClickWeight = dblClickSliderObj.value();
                }
                ial.incrementItemWeight(d,dblClickWeight,true,{'level':'INFO','eventType':'double_click'});
                addInterestPoint(d.Name);
            })
            .on('mouseover', function (d) {
                if(typeof(hoverSliderObj) != 'undefined'){
                    hoverWeight = hoverSliderObj.value();
                }
                ial.incrementItemWeight(d,hoverWeight,true,{'level':'INFO','eventType':'hover'});
                tip.show(d);
            })
            .on('mouseout', tip.hide);
    };

    main.drawProvenanceView = function (width,height) {
        var topNPoints = ial.getTopNPointsByInteractionWeights(12);
        var dataItemSessionLogs = ial.getDataItemLogs();
        var distributionMap = {};
        for(var i in topNPoints){
            var point = topNPoints[i];
            distributionMap[point.ial.id] = {
                'single_click':0,
                'double_click':0,
                'hover':0
            };
        }
        for(var i in dataItemSessionLogs){
            var logObj = dataItemSessionLogs[i];
            var dId = logObj.dataItem.ial.id;
            var interactionEvent = logObj.customLogInfo.eventType;
            if(dId in distributionMap){
                distributionMap[dId][interactionEvent]+=1;
            }
        }
        //console.log(distributionMap);
        for(var i in topNPoints){
            var point = topNPoints[i];
            var divId = 'topPoint_'+point.ial.id;
            var distributionDivId = 'distribution_'+divId;
            if(i%3==0) {
                $("#provenanceVisDiv").append("<div id='"+divId+"' class='topPointContainerDiv' style='float:left;text-overflow: ellipsis;width:300px;height:200px;'>")
            }else{
                $("#provenanceVisDiv").append("<div id='"+divId+"' class='topPointContainerDiv' style='float:left;text-overflow: ellipsis;margin-left:10px;width:300px;height:200px;'>")
            }
            $("#"+divId).append("<div id='"+divId+"_info'>")
            $("#"+divId+"_info").append("<label>Name: </label> "+point.Name);
            $("#"+divId+"_info").append("<br><label>Weight: </label> "+point.ial.weight);
            $("#"+divId).append("</div>")
            //$("#"+divId).append("<div id='"+distributionDivId+"' style='height:100px;width:300px'></div>"); // for distribution bar chart
            $("#"+divId).append("<div id='"+distributionDivId+"' style='height:100px;width:300px'><svg></svg></div>"); // for distribution donut chart
            var dataList = [];
            for(var label in distributionMap[point.ial.id]){
                dataList.push({'label':label,'value':distributionMap[point.ial.id][label]});
            }
            //drawDistributionBars(dataList,distributionDivId);
            drawDistributionDonut(dataList,distributionDivId);
            $("#provenanceVisDiv").append("</div>")
            //$("#"+divId).append('<p>Donut here</p>')
        }
    };

    function drawDistributionBars(data,divId){
        console.log(divId,data)
        sortObj(data,'value','d');
        var maxVal = data[0]['value'];
        var widthScale = d3.scale.linear().domain([0,maxVal]).range([0,100]);
        var row = d3.select('#'+divId)
            .selectAll("div")
            .data(data)
            .enter()
            .append("div")
            .attr("class","distributionrow")
            .style("margin-top","3px")
            .style("width","300px");

        row.append("div")
            .attr("class","distributionlabel")
            .attr("flex","1")
            .text(function(d) { return d.label; })

        //var widthMap = {};
        row.append("svg")
            //.attr("height", 200)
            .attr("width", 100)
            .append("rect")
            .attr("class","distributionbar")
            .attr("height",18)
            .attr("width", function(d) { return widthScale(d.value) + "px"; });

        row.append("div")
            .attr("class","distributionvalue")
            .text(function(d) {
                return d.value;
            });
    }

    function drawDistributionDonut(data,divId){
        //console.log(data)
        //Donut chart example
        nv.addGraph(function() {
            var chart = nv.models.pieChart()
                    .x(function(d) { return d.label })
                    .y(function(d) { return d.value })
                    .showLabels(false)     //Display pie labels
                    .labelThreshold(.05)  //Configure the minimum slice size for labels to show up
                    //.labelType("percent") //Configure what type of data to show in the label. Can be "key", "value" or "percent"
                    .donut(true)          //Turn on Donut mode. Makes pie chart look tasty!
                    .donutRatio(0.35)     //Configure how big you want the donut hole size to be.
                ;

            d3.select("#"+divId+" svg")
                .datum(data)
                .transition().duration(350)
                .call(chart);

            return chart;
        });
    }

    function populateAttributeWeightDiv(){
        $("#attributeWeightDiv").html("");
        //var curNormalizedAttributeVector = ial.getNormalizedAttributeVector();
        var curNormalizedAttributeVector = ial.getAttributeWeightVector();

        var data = [];
        for(var attribute in curNormalizedAttributeVector){
            data.push({'label':attribute,'value':curNormalizedAttributeVector[attribute],'width':0.0});
        }
        //data[1].value = 1;
        //data[3].value = 0;

        //var scale = d3.scale.linear()
        //    .domain([0,1])
        //    .range([0,180]);

        var row = d3.select('#attributeWeightDiv')
            .selectAll("div")
            .data(data)
            .enter()
            .append("div")
            .attr("class","inforow")
            .style("margin-top","3px")
            .style("width","300px");

        row.append("div")
            .attr("class","infolabel")
            .attr("flex","1")
            .text(function(d) { return d.label; })

        //var widthMap = {};
        row.append("svg")
            //.attr("height", 200)
            .attr("width", 200)
            .append("rect")
            .attr("class","infobar")
            .attr("width", function(d) { d.width = attributeWeightToBarWidthScale(d.value); return d.width + "px"; })
            .attr("height",18)
            .call(d3.behavior.drag().on('drag', function(d) {
                var newWidth = d.width + d3.event.dx;
                if(barWidthToAttributeWeightScale(newWidth)>=0.0000001 && barWidthToAttributeWeightScale(newWidth)<=1.001){
                    d.width = newWidth;
                    d3.select(this).attr('width',d.width);
                    d3.selectAll(".infovalue").style('opacity',0);
                    //console.log(d.width,barWidthToAttributeWeightScale(d.width));
                }
            }));

        row.append("div")
            .attr("class","infovalue")
            .text(function(d) {
                return parseFloat(Math.round(d.value* 10000) / 10000).toFixed(4);
            });
    }

    function updateAttributeWeightDiv(){
        //var curAttributeVector = ial.getNormalizedAttributeVector();
        var curAttributeVector = ial.getAttributeWeightVector();

        d3.selectAll('.infobar')
            .transition().duration(500)
            .attr('width', function (d) {
                d.value = curAttributeVector[d.label];
                d.width = attributeWeightToBarWidthScale(d.value);
                return d.width;
            });

        d3.selectAll('.infovalue')
            .style('opacity',1)
            .text(function(d) {
                return parseFloat(Math.round(d.value * 10000) / 10000).toFixed(4);
            });
    }

    function printAttributeVector(){
        //var curNormalizedAttributeVector = ial.getNormalizedAttributeVector();
        var curNormalizedAttributeVector = ial.getAttributeWeightVector();
        $("#attributeWeightDiv").html("");
        $("#attributeWeightDiv").append("<br>");
        for(var attribute in curNormalizedAttributeVector){
            $("#attributeWeightDiv").append("<p><b>"+attribute+": </b> "+curNormalizedAttributeVector[attribute]+"</p>");
        }
    }

    $("#topNButton_ByScore").click(function (event) {
        var n = $("#topNValue").val();
        getTopNPointsByItemScores(n);
    });

    $("#topNButton_ByWeight").click(function (event) {
        var n = $("#topNValue").val();
        getTopNPointsByInteractionWeight(n);
    });

    function getTopNPointsByItemScores(N){
        var topNPoints = ial.getTopNPointsByScores(N,true,{'level':'DEBUG'});
        $("#topNDiv").html("");
        $("#topNDiv").append("<br/><hr>");

        for(var i in topNPoints){
            $("#topNDiv").append("<div class='topNPoint' id='ialId:"+topNPoints[i]['ial']['id']+"'><p><b>Name: </b>"+topNPoints[i]['Name']+"</p><p><b>Score: </b>"+topNPoints[i]['ial']['itemScore']+"</p></div><hr>");
        }

        $(".topNPoint").mouseover(function(ev){
            var pointId = this.id.split(':')[1];
            d3.selectAll(".dot")
                .style('opacity',function (d) {
                    if(d.ial.id==pointId){
                        return 1;
                    }else{
                        return 0.1;
                    }
                });
        }).mouseout(function () {
            d3.selectAll(".dot").style('opacity',1);
        });
    }


    function getTopNPointsByInteractionWeight(N){
        var topNPoints = ial.getTopNPointsByInteractionWeights(N,true,{'level':'DEBUG'});
        $("#topNDiv").html("");
        $("#topNDiv").append("<br/><hr>");

        for(var i in topNPoints){
            $("#topNDiv").append("<div class='topNPoint' id='ialId:"+topNPoints[i]['ial']['id']+"'><p><b>Name: </b>"+topNPoints[i]['Name']+"</p><p><b>Weight: </b>"+topNPoints[i]['ial']['weight']+"</p></div><hr>");
        }

        $(".topNPoint").mouseover(function(ev){
            var pointId = this.id.split(':')[1];
            d3.selectAll(".dot")
                .style('opacity',function (d) {
                    if(d.ial.id==pointId){
                        return 1;
                    }else{
                        return 0.1;
                    }
                });
        }).mouseout(function () {
            d3.selectAll(".dot").style('opacity',1);
        });
    }

    $("#panel2").click(function (ev) {
        setTimeout(function(){
            if(firstopeneForInteractionPanel!=1){
                var stepList = [];
                for(var i = 0;i<=10;i+=1){
                    stepList.push(i);
                }

                clickSliderObj = d3.slider().min(0).max(10).ticks(2).stepValues(stepList).value(clickWeight);
                dblClickSliderObj = d3.slider().min(0).max(10).ticks(2).stepValues(stepList).value(dblClickWeight);
                hoverSliderObj = d3.slider().min(0).max(10).ticks(2).stepValues(stepList).value(hoverWeight);

                d3.select('#clickslider').call(clickSliderObj);
                d3.select('#dblclickslider').call(dblClickSliderObj);
                d3.select('#hoverslider').call(hoverSliderObj);
            }
            firstopeneForInteractionPanel = 1;
        },1);
    });

    $("#createClusterButton").click(function (ev) {
        computeClusters();
    });
    function computeClusters(){
        var clusterList = ial.createClusters();
        activeClusterList = clusterList;
        //console.log(clusterList);
    }

    $("#colorByClusterButton").click(function (ev) {
        colorByClusters();
    });
    function colorByClusters(){
        d3.selectAll('.dot').transition().duration(1000).style('fill',function(d){
            return color(d.ial.KNNClusterId);
        })
    }

    $("#resetAttributeWeightsButton").click(function (ev) {
        ial.resetAttributeWeightVector(true, {'level':'INFO','eventType':'reset_attribute_weight_vector'});
        updateAttributeWeightDiv();
    });


    $("#updateAttributeWeightBarsButton").click(function (ev) {
        var newWeightVector = {};
        d3.selectAll(".infobar").each(function (d) {
            if(barWidthToAttributeWeightScale(d.width)<=0.006){
                newWeightVector[d.label]=0.0;
            }else{
                newWeightVector[d.label]=barWidthToAttributeWeightScale(d.width);
            }
        });
        ial.setAttributeWeightVector(newWeightVector, true, {'level':'INFO','eventType':'set_attribute_weight_vector'});
        updateAttributeWeightDiv();
    });

    $("#cancelAttributeWeightUpdates").click(function(ev){
        d3.selectAll('.infobar')
            .transition().duration(500)
            .attr('width', function (d) {
                d.width = attributeWeightToBarWidthScale(d.value);
                return d.width;
            });

        d3.selectAll('.infovalue')
            .style('opacity',1)
            .text(function(d) {
                return parseFloat(Math.round(d.value * 10000) / 10000).toFixed(5);
            });
    });

    $("#getSimilarPoints").click(function(ev){
        var N = $("#NSimilarPointsValue").val();
        var focusCarName = $("#similarPointsFocusPoint").text();
        var focusDataPoint;
        d3.selectAll('.dot').each(function (d) {
            if(d.Name==focusCarName){
                focusDataPoint = d;
            }
        });
        getNSimilarPoints(focusDataPoint,N,true,{'level':'DEBUG'});
    });

    function getNSimilarPoints(focusPoint,N){
        var similarPoints = ial.getNSimilarPoints(focusPoint,N);
        console.log(similarPoints);
        $("#similarPointsDiv").html("");
        $("#similarPointsDiv").append("<hr>");
        /*
        for(var i in similarPoints){
            var ptDescr = "";
            var attrVec = ial.getAttributeWeightVector();
            for (var attr in attrVec)
                ptDescr += "<p><b>" + attr + " </b>" + similarPoints[i][attr] + "</p>";
            $("#similarPointsDiv").append("<div class='similarPoint' id='ialId:"+similarPoints[i]['ial']['ialId']+"'>" + ptDescr + "</div><hr>");
        }
        */
        for(var i in similarPoints){
            var point = similarPoints[i];
            $("#similarPointsDiv").append("<div class='similarPoint' id='ialId:"+point['ial']['id']+"'>" + point.Name + "</div><hr>");
        }

        $(".similarPoint").mouseover(function(ev){
            var pointId = this.id.split(':')[1];
            d3.selectAll(".dot")
                .style('opacity',function (d) {
                    if(d.ial.id==pointId){
                        return 1;
                    }else{
                        return 0.1;
                    }
                });
        }).mouseout(function () {
            d3.selectAll(".dot").style('opacity',1);
        });
    }

    function getRandomNumber(min, max) {
        return Math.random() * (max - min) + min;
    }

    $("#drawPCAButton").click(function (ev) {
        main.drawPCA(params.width,params.height);
    });

    $("#computeSubsetBias").click(function(ev){
        var biasResult = ial.computeSubsetBias(); 
        $("#biasResultsDiv").html("");
        $("#biasResultsDiv").append("<b>Subset Metric:</b> " + biasResult['result']);
    });

    $("#computeVarianceBias").click(function(ev){
        var biasResult = ial.computeVarianceBias(); 
        $("#biasResultsDiv").html("");
        $("#biasResultsDiv").append("<b>Variance Metric:</b> " + biasResult['result']);
    });

    $("#computeRepetitionBias").click(function(ev){
        var biasResult = ial.computeRepetitionBias(); 
        $("#biasResultsDiv").html("");
        $("#biasResultsDiv").append("<b>Repetition Metric:</b> " + biasResult['result']);
    });

    $("#computeAttributeWeightBias").click(function(ev){
        var biasResult = ial.computeAttributeWeightBias(); 
        $("#biasResultsDiv").html("");
        $("#biasResultsDiv").append("<b>Attribute Weight Metric:</b> " + biasResult['result']);
    });

    $("#computeAllBias").click(function(ev){
        var biasResult = ial.computeBias(); 
        $("#biasResultsDiv").html("");
        $("#biasResultsDiv").append("<b>All Metrics:</b> " + biasResult['result']);
    });

    $("#downloadBiasLogs").click(function(ev){
        var biasFileName = $("#downloadBiasFileName").val();
        bugout.logFilename = biasFileName;
        console.log("Downloading bias logs to " + biasFileName);

        /*var curData = ial.getData(); 
        bugout.log("------------------------------------------------");
        bugout.log("------------ DATA (" + curData.length + ") ------------");
        bugout.log("------------------------------------------------");
        for (var d in curData) bugout.log(curData[d]);
        bugout.log();*/

        /*var curAttrs = ial.getAttributeValueMap(); 
        bugout.log("------------------------------------------------");
        bugout.log("------------ ATTRIBUTES (" + Object.keys(curAttrs).length + ") ------------");
        bugout.log("------------------------------------------------");
        for (var attr in curAttrs) {
            bugout.log(attr + ":");
            bugout.log(curAttrs[attr]);
        }*/

        //bugout.downloadLog(); 

        bugout.logFilename = biasFileName + "_interaction_logs.txt";
        var interactionLogs = ial.getInteractionQueue(); 
        bugout.log("------------------------------------------------");
        bugout.log("------------ INTERACTION LOGS (" + interactionLogs.length + ") ------------"); 
        bugout.log("------------------------------------------------");
        bugout.log("[");
        for (var i = 0; i < interactionLogs.length; i++) {
            var log = interactionLogs[i];
            if (i < interactionLogs.length - 1) bugout.log(JSON.stringify(log) + ",");
            else bugout.log(JSON.stringify(log));
        }
        bugout.log("]");
        bugout.log();

        bugout.downloadLog(); 
        bugout.clear();
        bugout.logFilename = biasFileName + "_attribute_weight_logs.txt";

        var attributeWeightLogs = ial.getAttributeWeightVectorQueue(); 
        bugout.log("------------------------------------------------");
        bugout.log("------------ ATTRIBUTE WEIGHT LOGS (" + attributeWeightLogs.length + ") ------------"); 
        bugout.log("------------------------------------------------");
        bugout.log("[");
        for (var i = 0; i < attributeWeightLogs.length; i++) {
            var log = attributeWeightLogs[i]; 
            if (i < attributeWeightLogs.length - 1) bugout.log(JSON.stringify(log) + ",");
            else bugout.log(JSON.stringify(log));
        }
        bugout.log("]");

        bugout.downloadLog(); 
        bugout.clear(); 

        ial.printBiasLogs();

                /*var biasLogs = ial.getBiasLogs(); 
        bugout.log("------------------------------------------------");
        bugout.log("------------ BIAS LOGS (" + biasLogs.length + ") ------------"); 
        bugout.log("------------------------------------------------");
        for (var log in biasLogs) bugout.log(biasLogs[log]);
        bugout.log();*/

        //bugout.downloadLog();  

    });

    $("#groupClustersButton").click(function (ev) {
       main.drawKNN(params.width,params.height,activeClusterList)
    });

    $("#nullifyAttributeWeightsButton").click(function(ev){
        ial.nullifyAttributeWeightVector(true,{'level':'DEBUG'});
        updateAttributeWeightDiv();
    });

    $("#showProvenanceView").click(function(ev){
        $("#showAnalysisView").removeClass('active');
        $("#showProvenanceView").addClass('active');

        $("#vis").addClass('hide');
        $("#provenanceView").removeClass('hide');

        main.drawProvenanceView(params.width,params.height);
    });

    $("#showAnalysisView").click(function(ev){
        $("#showProvenanceView").removeClass('active');
        $("#showAnalysisView").addClass('active');

        $("#provenanceView").addClass('hide');
        $("#vis").removeClass('hide');

        d3.select("#provenanceVisDiv").html('');

        $("#vis").show();
    });

    function sortObj(list, key, order) {
        order = typeof order !== 'undefined' ? order : 'a';
        function compare(a, b) {
            if(key == "ial.weight" || key == "ial.id" || key == "ial.itemScore") {
                a = a["ial"][key];
                b = b["ial"][key];
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

    $("#downloadLogsButton").click(function(ev){
        downloadLogs();
    });

    function downloadLogs(){
        var textFile = null;
        makeTextFile = function (text) {
            var data = new Blob([text], {type: 'text/plain'});

            if (textFile !== null) {
                window.URL.revokeObjectURL(textFile);
            }

            textFile = window.URL.createObjectURL(data);

            return textFile;
        };
        var link = document.getElementById('downloadlink');
        var sessionLogs = ial.getSessionLogs();
        link.href = makeTextFile(JSON.stringify(sessionLogs, null, '\t'));
        link.download="sessionLogs.json";
        link.click();
    }

    function getCarObjectByName(name){
        for(var i in dataSet){
            var carObj = dataSet[i];
            if(carObj.Name==name){
                return carObj;
            }
        }
        return -1;
    }

    $("#generateWeightVectorButton").click(function(ev){
        generateWeightVectorByPoints();
    });

    function generateWeightVectorByPoints(){
        //var carName1 = $("#attributeGeneratingFocusPoint1").val();
        //var carName2 = $("#attributeGeneratingFocusPoint2").val();
        //var carName3 = $("#attributeGeneratingFocusPoint3").val();
        //var car1 = getCarObjectByName(carName1);
        //var car2 = getCarObjectByName(carName2);
        //var car3 = getCarObjectByName(carName3);

        var interestObjectsList = [];
        for(var i in interestPointsList){
            interestObjectsList.push(getCarObjectByName(interestPointsList[i]));
        }

        var derivedWeightVector;
        if (document.getElementById("useSimilaritiesForWeightVectorComputation").checked == true) {
            derivedWeightVector = ial.generateAttributeWeightVectorUsingSimilarity(interestObjectsList);
        }else if(document.getElementById("useDifferencesForWeightVectorComputation").checked == true) {
            derivedWeightVector = ial.generateAttributeWeightVectorUsingDifferences(interestObjectsList);
        }
        console.log(derivedWeightVector);
    }

    $("#generateAndApplyWeightVectorButton").click(function(ev){
        generateAndApplyWeightVectorByPoints();
    });

    function generateAndApplyWeightVectorByPoints(){
        //var carName1 = $("#attributeGeneratingFocusPoint1").val();
        //var carName2 = $("#attributeGeneratingFocusPoint2").val();
        //var carName3 = $("#attributeGeneratingFocusPoint3").val();
        //var car1 = getCarObjectByName(carName1);
        //var car2 = getCarObjectByName(carName2);
        //var car3 = getCarObjectByName(carName3);

        var interestObjectsList = [];
        for(var i in interestPointsList){
            interestObjectsList.push(getCarObjectByName(interestPointsList[i]));
        }

        var derivedWeightVector;
        if (document.getElementById("useSimilaritiesForWeightVectorComputation").checked == true) {
            derivedWeightVector = ial.generateAttributeWeightVectorUsingSimilarity(interestObjectsList);
        }else if(document.getElementById("useDifferencesForWeightVectorComputation").checked == true) {
            derivedWeightVector = ial.generateAttributeWeightVectorUsingDifferences(interestObjectsList);
        }
        ial.setAttributeWeightVector(derivedWeightVector, true, {'level':'INFO','eventType':'set_attribute_weight_vector'});
        updateAttributeWeightDiv();
    }

    function showDetails(d){
        $("#detailspanelcontent").html("");

        var contentStr = "";
        for (var attribute in d){
            if(attribute!='ial'){
                contentStr += "<strong>"+attribute+"</strong> <span style='color:red'>" + d[attribute]+ "</span><br>"
            }
        }
        contentStr += "<strong>ial.itemScore:</strong> <span style='color:red'>" + d.ial.itemScore + "</span><br>" +
            "<strong>ial.interactionWeight:</strong> <span style='color:red'>" + d.ial.weight + "</span><br>" +
            "<strong>ial.KNNClusterId:</strong> <span style='color:red'>" + d.ial.KNNClusterId + "</span><br>";

        $("#detailspanelcontent").append(contentStr);
    }

    function addInterestPoint(carName){
        if(interestPointsList.indexOf(carName)==-1){
            interestPointsList.push(carName);
            $("#interestPointsDiv").append("<p class='interestPoint' label="+carName+" id="+"interestPointIndex:"+interestPointsList.indexOf(carName)+">"+carName+"</p>");
        }
    }

    d3.selectAll(".interestPoint").on('click', function () {
        console.log(this)
    })

})();
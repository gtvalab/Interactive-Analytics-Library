/*
* All tests go here.
* */
(function () {

    var testData = [
        {
            "attribute1":10,
            "name":"item1",
            "attribute2":20,
            "attribute3":"Type1"
        },
        {
            "attribute1":30,
            "name":"item2",
            "attribute2":5,
            "attribute3":"Type2"
        }
    ];

    // initTest();
    // dataAdditionTest();
    // dataDeletionTest();

    function initTest() {
        ial.init(testData);
        console.log(testData)
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
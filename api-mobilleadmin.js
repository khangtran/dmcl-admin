
module.exports = function api(app) {

    app.post('/api/v1/newupdate', function (req, res) {
        var { package, version, link } = req.body;
        var newPackage = { package: package, version: version, link: link };

        var rawData = fs.readFileSync('appUpdateDatabase.json');
        var appUpdate = JSON.parse(rawData);
        if (appUpdate == null) appUpdate = [];

        console.log(`appUpdate`, appUpdate)

        // case modifile if exits
        var appPackage = null

        // for(var i =0;i< appUpdate.length;i++)
        // console.log(appUpdate)

        for (var i = 0; i < appUpdate.length; i++) {

            console.log(appUpdate[i].package, package)
            if (appUpdate[i].package == package) {
                console.log(`modifile package ${appPackage}`);
                appUpdate[i] = newPackage;
                appPackage = newPackage;
                return;
            }
        }

        // case not found, add new
        if (appPackage == null) {
            appPackage = newPackage;
            appUpdate.push(newPackage)
            console.log(`add package`, newPackage);
        }

        var raw = JSON.stringify(appUpdate);
        fs.writeFileSync('appUpdateDatabase.json', raw);

        console.log(`writte done`);

        return res.json({ message: 'success', data: appUpdate })
    })

    app.get('/api/v1/getupdate', function (req, res) {

        var { package, } = req.query;

        console.log('query', package)

        var rawData = fs.readFileSync('appUpdateDatabase.json');
        var appUpdate = JSON.parse(rawData)

        if (package == null)
            return res.json({ message: 'success', data: appUpdate })


        var appPackage = null
        for (var i = 0; i < appUpdate.length; i++)
            if (package == appUpdate[i].package) {
                appPackage = appUpdate[i];
                break;
            }

        return res.json({ message: 'success', data: appPackage })
    })

}

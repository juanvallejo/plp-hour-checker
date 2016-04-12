#!/usr/bin/env node

/**
* Provided under the MIT License (c) 2014
* See LICENSE @file for details.
*
* @file server.js
*
* @author juanvallejo
* @date 4/12/16
*
* Scanner application 'server'. Handles all data processing and i/o.
* Reads data from a local mysql database, builds an internal structure
* with it, and allows for easy manipulation of it. Outputs to .xlsx file.
*/

// define runtime consts
var SERVER_HOST             = process.env.OPENSHIFT_NODEJS_IP   || '127.0.0.1';
var SERVER_PORT             = process.env.OPENSHIFT_NODEJS_PORT || 8000;

var fs   = require('fs');
var http = require('http');
var io   = require('socket.io');

var Multiparty = require('multiparty');
var Jsdom     = require('node-jsdom');

var typeDefs = {
    'css'   : 'text/css'                ,
    'csv'   : 'text/csv'                ,
    'html'  : 'text/html'               ,
    'ico'   : 'image/x-icon'            ,
    'jpg'   : 'image/jpeg'              ,
    'jpeg'  : 'image/jpeg'              ,
    'js'    : 'application/javascript'  ,
    'map'   : 'application/x-navimap'   ,
    'pdf'   : 'application/pdf'         ,
    'png'   : 'image/png'               ,
    'ttf'   : 'application/octet-stream',
    'txt'   : 'text/plain'              ,
    'woff'  : 'application/x-font-woff'
}

var app = http.createServer(function(req, res) {

    if(req.url == '/' || req.url == '/index.html') {
        return fs.readFile(__dirname + '/index.html', function(err, data) {
            
            if(err) {
                console.log('Error reading requested path', req.url);
                return res.end(data);
            }

            res.writeHead(200, {'Content-Type': 'text/html'});
            res.end(data);

        });
    }

    if(req.url == '/upload' && req.method == 'POST') {
        
        var form = new Multiparty.Form();
        return form.parse(req, function(err, fields, files) {

            if(err) {
                console.log('Content type =', req.headers);
                console.log('ERR MULTIPARTY', err);
                return res.end('err_upload');
            }

            if(!files.excel) {
                console.log('Unexpected fileformname from client.');
                return res.end('err_filename');
            }

            fs.readFile(files.excel[0].path, function(err, data) {

                if(err) {
                    console.log('ERR MULTIPART', err);
                    return res.end('err_parse');
                }

                var doc = data.toString().split('<body>');
                if(!doc.length || !doc[1]) {
                    return res.end('err_doctype');
                }

                doc = doc[1].split('</body>')[0];
                if(!doc) {
                    return res.end('err_doctype');
                }
                
                parseDocData(doc, function(data) {
                    res.end(JSON.stringify(data));
                });

            });

        });

    }

    fs.readFile(__dirname + req.url, function(err, data) {

        if(err) {
            res.writeHead(404);
            return res.end('404. Page not found.');
        }

        var ext = req.url.split('.');
        ext = ext[ext.length - 1];
 
        res.writeHead(200, {'Content-Type': (typeDefs[ext] || 'text/plain')});
        res.end(data);

    });

});

app.listen(SERVER_PORT, SERVER_HOST);

io.listen(app).on('connection', function(client) {
    console.log('Client', client.id, 'has connected.');

    // emit id to client
    client.emit('id', {body: client.id});
});

function parseDocData(html, callback) {

    var response = {};

    try {
        
        var document = Jsdom.jsdom(html);
        var table = document.getElementsByTagName('table').item(0);
        var cols = table.getElementsByTagName('tr');

        var validCols = [];
        var validCountCols = [];
        var validRows = [];
        var totalHourCount = 0;
        var totalSemesterHourCount = 0;
        var totalYearHourCount = 0;
        var beginYearDate = new Date('2015,8,18');
        var beginSemDate = new Date('2016,1,1');

        for(var i = 1; i < cols.length; i++) {
            var row = cols.item(i).getElementsByTagName('td');
            var dateString = row.item(14).innerHTML;
            var dateStringArr = dateString.split('/');
            var rowDate = new Date(dateStringArr[2] + ',' + dateStringArr[1] + ',' + dateStringArr[0]);
            totalHourCount += parseFloat(row.item(13).innerHTML);
            validRows.push(cols.item(i));
            validCountCols.push(cols.item(i).getElementsByTagName('td').item(13))
            validCols.push({
                name: row.item(1).innerHTML,
                date: rowDate
            });

            if(rowDate.getTime() >= beginYearDate.getTime()) {
                totalYearHourCount += parseFloat(row.item(13).innerHTML);
            }

            if(rowDate.getTime() >= beginSemDate.getTime()) {
                totalSemesterHourCount += parseFloat(row.item(13).innerHTML);
            }
        }

        response = {
            error: false,
            message: '',
            name: (validCols[0].name || ''),
            hours: {
                semester: totalSemesterHourCount,
                year: totalYearHourCount,
                total: totalHourCount
            }
        };

    } catch(e) {
        console.log('JSDOM PARSE', e);
        response = {
            error: true,
            message: e.toString()
        }
    }

    callback.call(this, response);

}
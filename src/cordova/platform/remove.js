/**
    Licensed to the Apache Software Foundation (ASF) under one
    or more contributor license agreements.  See the NOTICE file
    distributed with this work for additional information
    regarding copyright ownership.  The ASF licenses this file
    to you under the Apache License, Version 2.0 (the
    "License"); you may not use this file except in compliance
    with the License.  You may obtain a copy of the License at
    http://www.apache.org/licenses/LICENSE-2.0
    Unless required by applicable law or agreed to in writing,
    software distributed under the License is distributed on an
    "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
    KIND, either express or implied.  See the License for the
    specific language governing permissions and limitations
    under the License.
*/

var Q = require('q');
var path = require('path');
var fs = require('fs');
var shell = require('shelljs');
var CordovaError = require('cordova-common').CordovaError;
var ConfigParser = require('cordova-common').ConfigParser;
var events = require('cordova-common').events;
var npmUninstall = require('cordova-fetch').uninstall;
var cordova_util = require('../util');
var config = require('../config');
var platformMetadata = require('../platform_metadata');
var promiseutil = require('../../util/promise-util');
var platforms = require('../../platforms/platforms');

module.exports = remove;

function remove (hooksRunner, projectRoot, targets, opts) {
    if (!targets || !targets.length) {
        return Q.reject(new CordovaError('No platform(s) specified. Please specify platform(s) to remove. See `' + cordova_util.binname + ' platform list`.'));
    }
    return hooksRunner.fire('before_platform_rm', opts)
        .then(function () {
            targets.forEach(function (target) {
                shell.rm('-rf', path.join(projectRoot, 'platforms', target));
                cordova_util.removePlatformPluginsJson(projectRoot, target);
            });
        }).then(function () {
            var config_json = config.read(projectRoot);
            var autosave = config_json.auto_save_platforms || false;
            var modifiedPkgJson = false;
            var pkgJson;
            var pkgJsonPath = path.join(projectRoot, 'package.json');
            // If statement to see if pkgJsonPath exists in the filesystem
            if (fs.existsSync(pkgJsonPath)) {
                pkgJson = cordova_util.requireNoCache(pkgJsonPath);
            }
            if (opts.save || autosave) {
                targets.forEach(function (target) {
                    var platformName = target.split('@')[0];
                    var xml = cordova_util.projectConfig(projectRoot);
                    var cfg = new ConfigParser(xml);
                    events.emit('log', 'Removing platform ' + target + ' from config.xml file...');
                    cfg.removeEngine(platformName);
                    cfg.write();
                    // If package.json exists and contains a specified platform in cordova.platforms, it will be removed.
                    if (pkgJson !== undefined && pkgJson.cordova !== undefined && pkgJson.cordova.platforms !== undefined) {
                        var index = pkgJson.cordova.platforms.indexOf(platformName);
                        // Check if platform exists in platforms array.
                        if (pkgJson.cordova.platforms !== undefined && index > -1) {
                            events.emit('log', 'Removing ' + platformName + ' from cordova.platforms array in package.json');
                            pkgJson.cordova.platforms.splice(index, 1);
                            modifiedPkgJson = true;
                        }
                    }
                });
                // Write out new package.json if changes have been made.
                if (modifiedPkgJson === true) {
                    fs.writeFileSync(pkgJsonPath, JSON.stringify(pkgJson, null, 2), 'utf8');
                }
            }
        }).then(function () {
            // Remove targets from platforms.json.
            targets.forEach(function (target) {
                events.emit('verbose', 'Removing platform ' + target + ' from platforms.json file...');
                platformMetadata.remove(projectRoot, target);
            });
        }).then(function () {
            // Remove from node_modules if it exists and --fetch was used.
            if (opts.fetch) {
                return promiseutil.Q_chainmap(targets, function (target) {
                    if (target in platforms) {
                        target = 'cordova-' + target;
                    }
                    // Edits package.json.
                    return npmUninstall(target, projectRoot, opts);
                });
            }
        }).then(function () {
            return hooksRunner.fire('after_platform_rm', opts);
        });
}

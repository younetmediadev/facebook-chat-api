"use strict";

var utils = require("../utils");
var log = require("npmlog");

module.exports = function(defaultFuncs, api, ctx) {
  return function fetchUrl(url, opts, callback) {
    if(!callback) {
      throw {error: "fetchUrl: need callback"};
    }

    defaultFuncs
      .get(url, ctx.jar)    
      .then(utils.saveCookies(ctx.jar))
      .then(function(res) {
        callback(null, res);
      })
      .catch(function(err) {
        log.error("Error in fetchUrl", err);
        return callback(err);
      });
  };
};

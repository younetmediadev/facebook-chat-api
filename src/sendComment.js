"use strict";

var utils = require("../utils");
var log = require("npmlog");
var bluebird = require("bluebird");

var allowedProperties = {
  attachment: true,
  url: true,
  sticker: true,
  body: true,
};

module.exports = function(defaultFuncs, api, ctx) {
  function uploadAttachment(attachments, callback) {
    var uploads = [];

    // create an array of promises
    for (var i = 0; i < attachments.length; i++) {
      if (!utils.isReadableStream(attachments[i])) {
        throw {error: "Attachment should be a readable stream and not " + utils.getType(attachments[i]) + "."};
      }

      var form = {
        upload_1024: attachments[i],
      };

      uploads.push(defaultFuncs
        .postFormData("https://upload.facebook.com/ajax/mercury/upload.php", ctx.jar, form, {})
        .then(utils.parseAndCheckLogin(ctx.jar, defaultFuncs))
        .then(function (resData) {
          if (resData.error) {
            throw resData;
          }

          // We have to return the data unformatted unless we want to change it
          // back in sendMessage.
          return resData.payload.metadata[0];
        }));
    }

    // resolve all promises
    bluebird
      .all(uploads)
      .then(function(resData) {
        callback(null, resData);
      })
      .catch(function(err) {
        log.error("Error in uploadAttachment", err);
        return callback(err);
      });
  }

  function getUrl(url, callback) {
    var form = {
      image_height: 960,
      image_width: 960,
      uri: url
    };

    defaultFuncs
      .post("https://www.facebook.com/message_share_attachment/fromURI/", ctx.jar, form)
      .then(utils.parseAndCheckLogin(ctx.jar, defaultFuncs))
      .then(function(resData) {
        if (resData.error) {
          return callback(resData);
        }

        if (!resData.payload) {
          return callback({error: 'Invalid url'});
        }

        callback(null, resData.payload.share_data.share_params);
      })
      .catch(function(err) {
        log.error("Error in getUrl", err);
        return callback(err);
      });
  }

  function sendContent(form, threadID, isSingleUser, messageAndOTID, callback) {
    // There are three cases here:
    // 1. threadID is of type array, where we're starting a new group chat with users
    //    specified in the array.
    // 2. User is sending a message to a specific user.
    // 3. No additional form params and the message goes to an existing group chat.
    if(utils.getType(threadID) === "Array") {
      for (var i  = 0; i < threadID.length; i++) {
        form['message_batch[0][specific_to_list][' + i + ']'] = "fbid:" + threadID[i];
      }
      form['message_batch[0][specific_to_list][' + (threadID.length) + ']'] = "fbid:" + ctx.userID;
      form['message_batch[0][client_thread_id]'] = "root:" + messageAndOTID;
      log.info("Sending message to multiple users: " + threadID);
    } else {
      // This means that threadID is the id of a user, and the chat
      // is a single person chat
      if(isSingleUser) {
        form['message_batch[0][specific_to_list][0]'] = "fbid:" + threadID;
        form['message_batch[0][specific_to_list][1]'] = "fbid:" + ctx.userID;
        form['message_batch[0][other_user_fbid]'] = threadID;
      } else {
        form['message_batch[0][thread_fbid]'] = threadID;
      }
    }

    if(ctx.globalOptions.pageID) {
      form['message_batch[0][author]'] = "fbid:" + ctx.globalOptions.pageID;
      form['message_batch[0][specific_to_list][1]'] = "fbid:" + ctx.globalOptions.pageID;
      form['message_batch[0][creator_info][creatorID]'] = ctx.userID;
      form['message_batch[0][creator_info][creatorType]'] = "direct_admin";
      form['message_batch[0][creator_info][labelType]'] = "sent_message";
      form['message_batch[0][creator_info][pageID]'] = ctx.globalOptions.pageID;
      form['request_user_id'] = ctx.globalOptions.pageID;
      form['message_batch[0][creator_info][profileURI]'] = "https://www.facebook.com/profile.php?id=" + ctx.userID;
    }

    defaultFuncs
      .post("https://www.facebook.com/ajax/mercury/send_messages.php", ctx.jar, form)
      .then(utils.parseAndCheckLogin(ctx.jar, defaultFuncs))
      .then(function(resData) {
        if (!resData) {
          return callback({error: "Send message failed."});
        }

        if (resData.error) {
          if (resData.error === 1545012) {
            log.warn("Got error 1545012. This might mean that you're not part of the conversation " + threadID);
          }
          return callback(resData);
        }

        var messageInfo = resData.payload.actions.reduce(function(p, v) {
          return {
            threadID: v.thread_fbid,
            messageID: v.message_id,
            timestamp: v.timestamp
          } || p; }, null);

        return callback(null, messageInfo);
      })
      .catch(function(err) {
        log.error("ERROR in sendMessage --> ", err);
        return callback(err);
      });
  }

  function send(form, threadID, messageAndOTID, callback) {
    // We're doing a query to this to check if the given id is the id of
    // a user or of a group chat. The form will be different depending
    // on that.
    if(utils.getType(threadID) === "Array") {
      sendContent(form, threadID, false, messageAndOTID, callback);
    } else {
      api.getUserInfo(threadID, function(err, res) {
        if(err) {
          return callback(err);
        }
        sendContent(form, threadID, Object.keys(res).length > 0, messageAndOTID, callback);
      });
    }
  }

  function handleUrl(msg, form, callback, cb) {
    if (msg.url) {
      form['message_batch[0][shareable_attachment][share_type]'] = '100';
      getUrl(msg.url, function (err, params) {
        if (err) {
          return callback(err);
        }

        form['message_batch[0][shareable_attachment][share_params]'] = params;
        cb();
      });
    } else {
      cb();
    }
  }

  function handleSticker(msg, form, callback, cb) {
    if (msg.sticker) {
      form['message_batch[0][sticker_id]'] = msg.sticker;
    }
    cb();
  }

  function handleAttachment(msg, form, callback, cb) {
    if (msg.attachment) {
      form['message_batch[0][image_ids]'] = [];
      form['message_batch[0][gif_ids]'] = [];
      form['message_batch[0][file_ids]'] = [];
      form['message_batch[0][video_ids]'] = [];

      if (utils.getType(msg.attachment) !== 'Array') {
        msg.attachment = [msg.attachment];
      }

      uploadAttachment(msg.attachment, function (err, files) {
        if (err) {
          return callback(err);
        }

        files.forEach(function (file) {
          var key = Object.keys(file);
          var type = key[0]; // image_id, file_id, etc
          form['message_batch[0][' + type + 's]'].push(file[type]); // push the id
        });
        cb();
      });
    } else {
      cb();
    }
  }

  return function sendComment(cmt, post_id, callback) {
    if(!callback && utils.getType(post_id) === 'Function') {
      return callback({error: "Pass a post_id as a second argument."});
    }
    if(!callback) {
      callback = function() {};
    }

    var msgType = utils.getType(cmt);
    var postIdType = utils.getType(post_id);

    if(msgType !== "String") {
      return callback({error: "Message should be of type string and not " + msgType + "."});
    }

    // Changing this to accomodate an array of users
    if(postIdType !== "Number" && postIdType !== "String") {
      return callback({error: "postIdType should be of type number or string and not " + postIdType + "."});
    }

// Origin form content
//    var form = {
//      'ft_ent_identifier' : '1561274830867489',
//      'comment_text' : 'asd',
//      'source' : 2,
//      'client_id' : '1458878082187:3232759813',
//      'session_id' : '6b56253c',
//      'reply_fbid' : '',
//      'parent_comment_id' : '',
//      'rootid' : 'u_0_16',
//      'clp' : '',
//      'attached_sticker_fbid' : 0,
//      'attached_photo_fbid' : 0,
//      'attached_video_fbid':0,
//      'feed_context':JSON.stringify({
//          "is_viewer_page_admin":false,
//          "is_notification_preview":false,
//          "autoplay_with_channelview_or_snowlift":false,
//          "fbfeed_context":true,
//          "location_type":5,
//          "outer_object_element_id":"u_0_v",
//          "object_element_id":"u_0_v",
//          "is_ad_preview":false,
//          "is_editable":false,
//          "shimparams":{
//              "page_type":16,
//              "actor_id":100009549611907,
//              "story_id":1561274830867489,
//              "ad_id":0,
//              "_ft_":"",
//              "location":"permalink"
//          },
//          "story_id":"u_0_w",
//          "caret_id":"u_0_x",
//          "__IS_INSIDE_UI_FEEDBACK_FORM__":true
//      }),
//      'ft[tn]':'[]',
//      'ft[fbfeed_location]':5,
//      'av' : 100009549611907,
//      '__user' : 100009549611907,
//      '__a' : 1,
//      '__dyn' : '5V5yAW8-aFoAwmgDxyIGzGomyp9EbEyGgS8zCC-C26m6oKezob4q68K5UcU-2CEf8vkwy3eEjKcDKuEjK5okz8uwTADDBBwDK4VqCzEbe78O49Elxq6U',
//      '__req' : '7b',
//      'fb_dtsg' : 'AQHoUyTk1-oW:AQF2L9LimP2Z',
//      'ttstamp' : '265817211185121841074945111875865817050765776105109805090',
//      '__rev' : 2246636,
//    };

    var form = {
      'ft_ent_identifier' : post_id,
      'comment_text' : cmt,
      'source' : 2,
      'client_id' : (new Date()).getTime() + ':3232759813',
      'feed_context':JSON.stringify({
          "is_viewer_page_admin":false,
          "is_notification_preview":false,
          "autoplay_with_channelview_or_snowlift":false,
          "fbfeed_context":true,
          "location_type":5,
          "outer_object_element_id":"u_0_v",
          "object_element_id":"u_0_v","is_ad_preview":false,
          "is_editable":false,
          "shimparams":{
              "page_type":16,
              "actor_id":ctx.userID,
              "story_id":post_id,
              "ad_id":0,
              "_ft_":"",
              "location":"permalink"
          },
          "story_id":"u_0_w",
          "caret_id":"u_0_x",
          "__IS_INSIDE_UI_FEEDBACK_FORM__":true
      }),
      'av' : ctx.userID,
      '__user' : ctx.userID
    };

    defaultFuncs
      .post("https://www.facebook.com/ufi/add/comment/?__pc=PHASED%3ADEFAULT&dpr=1", ctx.jar, form)
      .then(utils.parseAndCheckLogin(ctx.jar, defaultFuncs))
      .then(function(resData) {
        if (!resData) {
          return callback({error: "Send comment failed."});
        }

        if (resData.error) {
          if (resData.error === 1357006) {
            log.warn("Got error 1357006. This might mean that you're not allow to view the post " + post_id);
          }
          return callback(resData);
        }

        try
        {
          var result = null;
          resData = resData.jsmods.require[1][3][1].comments[0];
          result = {
            text: resData.body.text,
            id: resData.id,
            fbid: resData.fbid,
            author: resData.author,
            created_date: resData.timestamp.time
          };
        }
        catch(exc)
        {
          callback({error: 'We were able to comment to the post, but unable to retrive the post info'});
          return;
        }

        return callback(null, result);
      })
      .catch(function(err) {
        log.error("ERROR in sendMessage --> ", err);
        return callback(err);
      });
  };
};

var fs = require('fs');
var Trello = require("node-trello");
var config = require('./config');

var trello = new Trello(config.key, config.token);

var hr = '___';
var h1 = '# ';
var h3 = '### ';
var h4 = '#### ';
var h5 = '##### ';
var br = '\n';

var currentWaitTime = 0;
var DELTA_WAIT_TIME = 150; //Wait 150 milliseconds between request so we're not attacking Trello's API

createMarkdowns();

/**
 * This will generate the markdown files for each board and
 * cards within each board
 */
function createMarkdowns() {

  config.boards.forEach(function (boardId) {
    trello.get('/1/boards/' + boardId + '?cards=all&lists=all&members=all&member_fields=all&checklists=all&fields=all', function (error, boardJSON) {
      if (error) {
        console.log(error);
      }
      var boardName = cleanFileName(boardJSON.name);
      if (boardName) {

        var boardShortUrl = boardJSON.shortUrl;
        var cards = boardJSON.cards;
        var cardDirectory = ''; 
        var boardDirectory = cleanFileName(boardName) + '/';
        var downloadDirectory = cleanFileName(boardName) + '/downloads/';

        var tableOfContentsFile = boardDirectory + boardName + '.md';
  
        //Set the title of the table of contents the the board name (and link the board name to the board)
        var tableOfContents = h1 + '[' + boardName + '](' + boardShortUrl + ')' + br + br;

        //Make the board directory if they does not already exist
        if (!fs.existsSync(boardDirectory)) {
          fs.mkdirSync(boardDirectory);
        }

        //Make the download directory if they does not already exist
        if (!fs.existsSync(downloadDirectory)) {
          fs.mkdirSync(downloadDirectory);
        }

        cards.forEach(function (card) {
          
          var cardName = card.name;
          cardName = cleanFileName(cardName);

          var listName = boardJSON.lists.filter(list => list.id === card.idList);      
          cardDirectory = cleanFileName(listName[0].name) + '/';
          
          var cardFilePath = boardDirectory + cardDirectory + cardName + '.md';     

          //Make the card directory if they does not already exist
          if (!fs.existsSync(boardDirectory + cardDirectory)) {
            fs.mkdirSync(boardDirectory + cardDirectory);
          }

          //Add the card to the table of contents and link the card to the card's markdown file
          tableOfContents += h3 + 'Card #' + card.idShort + ' [' + cardName +'](' + cardFilePath + ')' + br;
          tableOfContents += '*Last Modified: ' + (new Date(card.dateLastActivity)).toUTCString() + '*' + br;
          tableOfContents += hr + br;
    
          setTimeout(function () {
            createCardMarkdown(card.id, cardName, cardFilePath, downloadDirectory, true);
          }, currentWaitTime);
          currentWaitTime += DELTA_WAIT_TIME;
                
        });

        //Write the table of contents to its markdown file
        fs.writeFileSync(tableOfContentsFile, tableOfContents);
      }
    });
  });
}

function createCardMarkdown(cardId, cardName, cardFilePath, downloadDirectory, retry) {
  trello.get('/1/card/' + cardId + '?actions=all&actions_limit=1000&members=true&member_fields=all&checklists=all&checklist_fields=all&attachments=true', function (error, cardJSON) {
    if (error) {
      if (retry) {
        console.log('An error has occurred when gathering cardid ' + cardId);
        console.log('Retrying to get the actions now...');
        createCardMarkdown(cardId, cardName, cardFilePath, downloadDirectory, false);
      } else {
        console.log('Requesting ' + cardId + ' failed again.');
        console.log('It will not be requested again.');
      }
    } else {
      console.log('Successful request for ' + cardName);

      var actions = cardJSON.actions;
      var members = cardJSON.members;
      var checkLists = cardJSON.checklists;
      var cardLabels = cardJSON.labels
      var description = cardJSON.desc 

      //----------------CARD MARKDOWN----------------

      //Set the short id of the card as the title of the markdown file
      var cardMd = h3 + cardName + br + hr + br;;

      //----------------DESCRIPTION----------------
      //If there is no description, we just won't display the field
      if (description.length > 0) {
        cardMd += h4 + 'Description' + br;
        cardMd += description + br;
      }
      //----------------END DESCRIPTION----------------

      //----------------MEMBERS----------------
      if (members.length > 0) {        
        cardMd += br + h4 + ' Members' + br;
        members.forEach(function (member) {
          cardMd += '* ' + member.fullName + br;
        });
      }
      //----------------END MEMBERS----------------

      //----------------LABELS----------------
      if (cardLabels.length > 0) {
        cardMd += br + h4 + 'Labels' + br;
        cardLabels.forEach(function (label) {
          var labelName = label.name;
          if (labelName.length <= 0) {
            //If the label has an empty name, we'll set the name
            //to [unnamed label] within the markdown to show that
            //there is still labels associated with the card
            labelName = '[unnamed label]';
          }
          cardMd += '* ' + labelName + br;
        });
      }
      //----------------END LABELS----------------

      //----------------CHECKLISTS----------------
      if (checkLists.length > 0) {
        cardMd += br + h4 + 'Checklists' + br;
        checkLists.forEach(function (list) {
          cardMd += h5 + list.name + br;
          list.checkItems.forEach(function (item) {
            cardMd += '- [';

            if (item.state === 'complete') {
              cardMd += 'x] ' + item.name;
            } else {
              cardMd += ' ] ' + item.name;
            }

            cardMd += br;
          });
        });
      }
      //----------------END CHECKLISTS----------------

      //----------------COMMENTS----------------
      var commentActions = actions.filter(function (action) {
        if (action.type === 'commentCard') {
          return action;
        }
      });
      if (commentActions.length > 0) {
        cardMd += br + h4 + 'Comments' + br;
        commentActions.forEach(function (action) {
          var commentUserFullName = action.memberCreator.fullName;
          var date = (new Date(action.date)).toUTCString();
          var content = action.data.text;
          cardMd += h5 + commentUserFullName + ' - *' + date + '*' + br;
          cardMd += '```' + br;
          cardMd += content + br;
          cardMd += '```' + br;
        });
      }
      //----------------END COMMENTS----------------

      //----------------HISTORY----------------
      cardMd += br + h4 + 'History' + br;
      actions.forEach(function (action) {
        var type = action.type;
        var attachmentAdded = false;
        if (type.indexOf('Card') > -1) {
          var userFullName = action.memberCreator.fullName;
          var date = (new Date(action.date)).toUTCString();
          var info = '';
          switch (type) {
            case 'createCard':
              info = 'Added the card to ' + action.data.list.name;
              break;
            case 'updateCheckItemStateOnCard':
              info = 'Marked ' + action.data.checkItem.name + ' on ' + action.data.checklist.name + ' ' + action.data.checkItem.state;
              break;
           default:
              info = '';
          }          
          if(info) { 
            cardMd += h5 + userFullName + ' - *' + date + '*' + br;
            cardMd += '`' + br;
            cardMd += info + br;
            if (!attachmentAdded) {
              cardMd += '`' + br;
            }
          }
        }
      });
      //----------------END HISTORY----------------

      //----------------ATTACHMENTS----------------
      var attachments = cardJSON.attachments;
      //Similar to description, if there are attachments,
      //then we'll display them, else we won't show the field
      if (attachments && attachments.length > 0) {
        cardMd += br + h4 + 'Attachments:' + br;
        attachments.forEach(function (attachment) {
          var attachmentName =  attachment.id + '-' + cleanFileName(attachment.name);
          cardMd += '* [' + attachmentName + '](' + attachment.url + ')' + br;
          
          //Attachment on trello
          if(attachment.url.indexOf('https://trello') !== -1)  {
            console.log('Downloading ' + attachmentName + ' on ' + attachment.url);
            download(attachment.url, downloadDirectory + attachmentName);
            cardMd += '* ![[' + attachmentName + ']]' + br;            
          }

        });
      }
      //----------------END ATTACHMENTS----------------

      cardMd += br + h4 + 'Card Id: ' + cardJSON.idShort + ' - URL: [' + cardJSON.shortUrl + '](' + cardJSON.shortUrl + ')' + br;    
      
      //----------------END CARD MARKDOWN----------------

      //Write the card's markdown to its markdown file
      fs.writeFileSync(cardFilePath, cardMd);
    }
  });
}

function cleanFileName(fileDirName) {
  return fileDirName.replace(/[/\\?%*:|"<>]/g, '-');    
}

var http = require("https");
var fs = require("fs");

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest, { flags: "wx" });

        const request = http.get(url, response => {
            if (response.statusCode === 200) {
                response.pipe(file);
            } else {
                file.close();
                fs.unlink(dest, () => {}); // Delete temp file
                reject(`Server responded with ${response.statusCode}: ${response.statusMessage}`);
            }
        });

        request.on("error", err => {
            file.close();
            fs.unlink(dest, () => {}); // Delete temp file
            reject(err.message);
        });

        file.on("finish", () => {
            resolve();
        });

        file.on("error", err => {
            file.close();

            if (err.code === "EEXIST") {
                reject("File already exists: " + dest);
            } else {
                fs.unlink(dest, () => {}); // Delete temp file
                reject(err.message);
            }
        });
    });
}
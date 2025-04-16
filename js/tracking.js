function updateHighlight() {
    let text = document.getElementById('editor').value;

    if (text == "") {
        text = localStorage.getItem('editorText');
    }

    text = getTextWithTimestamps(text);

    const summaryCollection = getSummaryCollection(text);
    const summaryText = getSummaryText(summaryCollection);

    const editorText = text;

    let highlightText = escapeHtml(editorText);
    highlightText = getTextWithHighlights(highlightText);
    
    document.getElementById('editor').value = editorText;
    document.getElementById('highlight').innerHTML = highlightText;
    document.getElementById('summary').innerHTML = summaryText;

    localStorage.setItem('editorText', editorText);
}

function escapeHtml(text) {
    var map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function (m) { return map[m]; });
}

/**
 * @param {string} text 
 * @returns {string}
 */
function getTextWithTimestamps(text){
    var lines = text.split('\n');
    lines = lines.map(line => {
        var segments = line.split(" - ");

        if (segments.length == 1) {
            //Get current date in format "11:00 AM"
            var date = new Date();
            var options = { hour: '2-digit', minute: '2-digit', hour12: true };
            var time = date.toLocaleTimeString([], options);

            return `${time} - `;
        }

        return line
    })
    return lines.join('\n');
}

/**
 * @param {string} text 
 * @returns {string}
 */
function getTextWithHighlights(text){
    let lines = text.split('\n');
    lines = lines.map(line => {
        const keyWords = getAllKeyWords(line);
        for (const keyWord of keyWords) {
            let color = "red";
            const keyWordText = keyWord.replace("#", "");
            const workItemNumber = parseInt(keyWordText);

            if(!isNaN(workItemNumber)) {
                color = "blue";
            }
            else if(keyWordText.toLowerCase() == "meeting"){
                color = "orange";
            }
            else{
                color = "red";
            }

            line = line.replace(keyWord, `<span style='color: ${color};'>${keyWord}</span>`);
        }
        return line;
    });
    return lines.join('\n');
}

/**
 * @param {string} text 
 * @returns {string[]}
 */
function getAllKeyWords(text) {
    var words = text.split(" ");
    var keyWords = words.filter(word => word.startsWith("#"));
    return keyWords;
}

/***
 * Processes string with format "11:00 AM" to Date, or null if not valid
 * @param {string} text - The input text.
 * @returns {Date | null} - The resulting date, assuming it is the current day
 */
function getDateFromString(text) {
    try {
        var date = new Date();
        var time = text.split(" ")[0];
        var ampm = text.split(" ")[1];
        var hour = parseInt(time.split(":")[0]);
        var minute = parseInt(time.split(":")[1]);
        if (ampm == "PM" && hour != 12) {
            hour += 12;
        }
        if (ampm == "AM" && hour == 12) {
            hour = 0;
        }
        date.setHours(hour);
        date.setMinutes(minute);
        return date;
    } catch (error) {
        console.error(error);
        return null;
    }
}

/**
 * @param {string} text
 * @returns {Object<string, number>}
 */
function getSummaryCollection(text) {
    var lines = text.split('\n');

    var summaryCollection = {};
    var previousTime = null;
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var segments = line.split(" - ");
        var timestamp = getDateFromString(segments[0]);

        var deltaTimeMinutes = 0;
        if (previousTime) {
            var diffMiliseconds = timestamp - previousTime;
            deltaTimeMinutes = Math.floor(diffMiliseconds / (1000 * 60));
        }
        previousTime = timestamp;

        var keyWords = getAllKeyWords(segments[1]);
        for (var word of keyWords) {
            if (word in summaryCollection) {
                summaryCollection[word] += deltaTimeMinutes;
            } else {
                summaryCollection[word] = deltaTimeMinutes;
            }
        }
    }

    return summaryCollection;
}

/**
 * @param {Object<string, number>} summaryCollection
 * @returns {string}
 */
function getSummaryText(summaryCollection){
    let summaryText = "Tasks:<br/>";
    let totalTaskMinutes = 0;
    let totalMeetingMinutes = 0;
    for (const key in summaryCollection) {
        const minutes = summaryCollection[key];
        const itemText = key.replace("#", "");
        const workItemNumber = parseInt(itemText);
        if(!isNaN(workItemNumber)) {
            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            totalTaskMinutes += minutes;
            const workItemText = `#${itemText} (<a href='https://tfs.clarkinc.biz/DefaultCollection/Shipment%20Telemetrics/_workitems/edit/${workItemNumber}' target='_blank'>Link</a>)`;
            summaryText += `${workItemText}: ${hours}h ${remainingMinutes}m<br/>`;
        }
        else if(itemText.toLowerCase() == "meeting") {
            totalMeetingMinutes += minutes;
        }
    }

    summaryText += `<br/>`;
    summaryText += `Total Task Time: ${getTimeSpentString(totalTaskMinutes)}<br/>`;
    summaryText += `Total Meeting Time: ${getTimeSpentString(totalMeetingMinutes)}<br/>`;

    return summaryText;
}

function getTimeSpentString(minutes){
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
}

// Initialize the highlighted view on page load.
updateHighlight();
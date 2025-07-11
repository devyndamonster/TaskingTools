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
    var summaryCollection = {};
    var workItems = getWorkItems(text);

    for (const key in workItems) {
        const tasks = workItems[key];
        for (const task of tasks) {
            if (key in summaryCollection) {
                summaryCollection[key] += task.taskTimeMinutes;
            } else {
                summaryCollection[key] = task.taskTimeMinutes;
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
            const workItemText = `#${itemText}`;
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


/**
 * @returns {{ [workItemNumber: number]: { taskName: string, taskTimeMinutes: number }[] }}
 */
function getWorkItems(text) {
    const lines = text.split('\n');
    const workItems = {};

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

        var keyWord = getAllKeyWords(segments[1]).at(0);
        if (!keyWord) {
            continue;
        }

        const workItemNumber = parseInt(keyWord.replace("#", ""));
        if(isNaN(workItemNumber)) {
            continue;
        }

        const taskDescription = segments[1].replace(keyWord, "").trim();
        
        if(workItems[workItemNumber]) {
            workItems[workItemNumber].push({
                taskName: taskDescription,
                taskTimeMinutes: deltaTimeMinutes
            });
        }
        else {
            workItems[workItemNumber] = [{
                taskName: taskDescription,
                taskTimeMinutes: deltaTimeMinutes
            }];
        }
    }

    return workItems;
}

async function submitChanges(){
    /**
     * @type {{ url: string, pat: string, org: string, project: string } | null}
     */
    const adoConfig = JSON.parse(localStorage.getItem('ado-config'));

    if (!adoConfig) {
        alert("Please configure ADO settings first.");
        return;
    }
    
    const text = document.getElementById('editor').value;
    const workItemTaskCollection = getWorkItems(text);

    console.log(workItemTaskCollection);

    //Task time should be rounded from minutes to nearest 15 minutes, and then divided by 60
    /** @type {{ parentWorkItemNumber: number, taskName: string, taskTimeRounded: number }[]} */
    const workItemTasks = Object.keys(workItemTaskCollection).flatMap((workItemNumberKey) => {
        const workItemNumber = parseInt(workItemNumberKey);
        const tasks = workItemTaskCollection[workItemNumber];
        return tasks.map(({ taskName, taskTimeMinutes }) => ({
            parentWorkItemNumber: workItemNumber,
            taskName,
            taskTimeRounded: Math.round(taskTimeMinutes / 15) * 15 / 60
        }))
    });

    const workItemDisplayText = workItemTasks.map(({ parentWorkItemNumber, taskName, taskTimeRounded }) => {
        return `Work Item #${parentWorkItemNumber}: ${taskName} (${taskTimeRounded}h)`;
    }).join("\n");

    if(!confirm("you are about to submit the following tasks:\n" + workItemDisplayText))
    {
        return;
    }

    const workItemParentMap = new Map();

    // Fetch each work item's parent from ADO
    for (const { parentWorkItemNumber } of workItemTasks) {
        if (!workItemParentMap.has(parentWorkItemNumber)) {
            const parentWorkItem = await getWorkitem(parentWorkItemNumber);
            console.log(parentWorkItem)
            workItemParentMap.set(parentWorkItemNumber, parentWorkItem);
        }
    }

    //Loop over work items and get all child tasks
    for(const parentWorkItem of workItemParentMap.values()) {
        /** @type {number[]} */
        const childTasks = (parentWorkItem.relations ?? [])
            .filter(relation => relation.rel === "System.LinkTypes.Hierarchy-Forward")
            .map(relation => {
                const urlParts = relation.url.split('/');
                return parseInt(urlParts[urlParts.length - 1]);
            });

        console.log("child tasks for work item #" + parentWorkItem.id + ": " + childTasks);

        for(const childTaskId of childTasks) {
            const childTask = await getWorkitem(childTaskId);
            console.log(childTask);
            
            if(parentWorkItem.children){
                parentWorkItem.children.push(childTask);
            }
            else {
                parentWorkItem.children = [childTask];
            }
        }
    }

    console.log("work item parent map: ", workItemParentMap);

    for (const task of workItemTasks) {

        //If the parent already has the child task, update the time
        const parentWorkItem = workItemParentMap.get(task.parentWorkItemNumber);

        const childTask = parentWorkItem.children?.find(child => {
            const isMatchingTitle = child.fields["System.Title"] === task.taskName;
            const isAssignedToMe = child.fields["System.AssignedTo"]?.uniqueName === adoConfig.username;
            return isMatchingTitle && isAssignedToMe;
        });

        if (childTask) {
            const completedWork = childTask.fields["Microsoft.VSTS.Scheduling.CompletedWork"] || 0;
            const newCompletedWork = completedWork + task.taskTimeRounded;
            const fields = [
                {
                    "op": "add",
                    "path": "/fields/Microsoft.VSTS.Scheduling.CompletedWork",
                    "value": newCompletedWork
                }
            ];

            const updatedTask = await updateWorkItem(childTask.id, fields);
            console.log(`Updated task #${childTask.id}`, updatedTask);
        }

        //If the parent does not have the child task, create it
        else {
            const newTask = await createTaskWorkItem(task.parentWorkItemNumber, task.taskName, task.taskTimeRounded);
            console.log(`Created new task #${newTask.id}`, newTask);
        }

    }

}

async function getWorkitem(workItemId) {
    const adoConfig = JSON.parse(localStorage.getItem('ado-config'));
    const adoUrl = adoConfig.url;
    const adoPat = adoConfig.pat;
    const adoOrg = adoConfig.org;
    const adoProject = adoConfig.project;

    const workItemResponse = await fetch(`${adoUrl}/${adoOrg}/${adoProject}/_apis/wit/workitems/${workItemId}?api-version=7.1&$expand=relations`, 
    {
        headers: 
        {
            'Authorization': `Basic ${btoa(`:${adoPat}`)}`
        }
    })

    return await workItemResponse.json();
}

async function updateWorkItem(workItemId, fields) {
    const adoConfig = JSON.parse(localStorage.getItem('ado-config'));
    const adoUrl = adoConfig.url;
    const adoPat = adoConfig.pat;
    const adoOrg = adoConfig.org;
    const adoProject = adoConfig.project;

    const response = await fetch(`${adoUrl}/${adoOrg}/${adoProject}/_apis/wit/workitems/${workItemId}?api-version=7.1`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json-patch+json',
            'Authorization': `Basic ${btoa(`:${adoPat}`)}`
        },
        body: JSON.stringify(fields)
    });

    if (!response.ok) {
        throw new Error(`Error updating work item: ${response.statusText}`);
    }

    return await response.json();
}

async function createTaskWorkItem(parentWorkItemId, taskName, taskTimeRounded) {
    const adoConfig = JSON.parse(localStorage.getItem('ado-config'));
    const adoUrl = adoConfig.url;
    const adoPat = adoConfig.pat;
    const adoOrg = adoConfig.org;
    const adoProject = adoConfig.project;
    const adoUsername = adoConfig.username;

    const fields = [
        {
            "op": "add",
            "path": "/fields/System.Title",
            "value": taskName
        },
        {
            "op": "add",
            "path": "/fields/Microsoft.VSTS.Scheduling.CompletedWork",
            "value": taskTimeRounded
        },
        {
            "op": "add",
            "path": "/relations/-",
            "value": {
                "rel": "System.LinkTypes.Hierarchy-Reverse",
                "url": `${adoUrl}/${adoOrg}/${adoProject}/_apis/wit/workitems/${parentWorkItemId}`,
                "attributes": {
                    "comment": "Making a new link for the dependency"
                }
            }
        },
        {
            "op": "add",
            "path": "/fields/System.AssignedTo",
            "value": adoUsername
        }
    ];

    let response = await fetch(`${adoUrl}/${adoOrg}/${adoProject}/_apis/wit/workitems/$Task?api-version=7.1&$expand=relations`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json-patch+json',
            'Authorization': `Basic ${btoa(`:${adoPat}`)}`
        },
        body: JSON.stringify(fields)
    });

    if (!response.ok) {
        throw new Error(`Error creating work item: ${response.statusText}`);
    }

    //Now immediately update the work item to done
    const createdWorkItem = await response.json();
    const doneFields = [
        {
            "op": "add",
            "path": "/fields/System.State",
            "value": "Done"
        }
    ];

    return await updateWorkItem(createdWorkItem.id, doneFields);
}

function getTimeSpentString(minutes){
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
}

// Initialize the highlighted view on page load.
updateHighlight();
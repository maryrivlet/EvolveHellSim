var gStop = false;
var gSimWorkers = [];
var gParams = {};
var gSimParams = {};
var gSim = {
    startTime: 0,
    simsActive: 0,
    simsDone: 0,
    currentSim: 0,
    progress: 0,
    stats: {},
    params: {}
};

function Simulate() {
    $('#result').val("Running...\n");

    console.log("Simulate " + Date.now());
    
    /* Change the Simulate button to a Stop button. */
    let btnWidth = $('#simButton').width();
    $('#simButton').text("Stop");
    $('#simButton').width(btnWidth);
    $('#paramsForm').unbind("submit");
    $('#paramsForm').submit(function(event) {
        event.preventDefault();
        SimCancel();
    });

    GetParams();
    
    /* Make sure the right number of workers are set up */
    SetupSimWorkers();
    
    /* Make a copy of gParams so that the sim params don't change if the user changes something in the UI.
       Shallow copy should be fine */
    gSim.params = Object.assign({}, gParams);
    
    gSim.stats = InitStats(gSim.params);
    gSim.startTime = Date.now();
    gSim.progress = 0;
    gSim.simsActive = 0;
    gSim.simsDone = 0;
    gSim.currentSim = 0;
    
    gStop = false;
    
    /* Begin sims on all the workers */
    for (var i = 0; i < gSimWorkers.length && i < gSim.params.sims; i++) {
        gSim.currentSim++;
        gSimWorkers[i].postMessage({
            cmd: 'start',
            id: i,
            simId: gSim.currentSim,
            params: gSim.params,
            stats: InitStats(gSim.params)
        });
        
        gSim.simsActive++;
    }
}

function InitStats(params) {
    return {
        outputStr: "",
        ticks: 0,
        patrolGems: 0,
        surveyorGems: 0,
        forgeGems: 0,
        gunGems: 0,
        gateGems: 0,
        patrolKills: 0,
        droneKills: 0,
        totalPreFightThreat: 0,
        minPreFightThreat: params.threat,
        maxPreFightThreat: params.threat,
        totalPostFightThreat: 0,
        minPostFightThreat: params.threat,
        maxPostFightThreat: params.threat,
        bloodWars: 0,
        patrolEncounters: 0,
        skippedEncounters: 0,
        ambushes: 0,
        soldiersTrained: 0,
        soldiersKilled: 0,
        soldiersRevived: 0,
        totalWounded: 0,
        maxWounded: 0,
        ambushDeaths: 0,
        minReserves: params.garrison + params.defenders,
        surges: 0,
        sieges: 0,
        totalWalls: 0,
        minWalls: 100,
        totalSurveyors: 0,
        minSurveyors: params.surveyors,
        wallFails: 0,
        wallFailTicks: 0,
        patrolFails: 0,
        patrolFailTicks: 0,
        totalPatrolsSurvived: 0,
        minPatrolsSurvived: params.patrols,
        maxPatrolsSurvived: 0,
        totalPity: 0,
        totalPityPerGem: 0,
        maxPity: 0,
        totalGarrison: 0,
        kills: 0,
        forgeOn: 0,
        forgeSouls: 0,
        mercCosts: 0,
        mercsHired: 0,
        maxMercPrice: 0,
        minMoney: params.moneyCap,
    };
}

function MergeStats(totalStats, newStats) {
    for (const key in newStats) {
        if (key.match(/^min(?=[A-Z])/)) {
            if (newStats[key] < totalStats[key]) {
                totalStats[key] = newStats[key];
            }
        } else if (key.match(/^max(?=[A-Z])/)) {
            if (newStats[key] > totalStats[key]) {
                totalStats[key] = newStats[key];
            }
        } else {
            totalStats[key] += newStats[key];
        }
    }
}

function UpdateProgressBar(increment) {
    let newProgress = gSim.progress + increment;
    let newProgressPct = newProgress / gSim.params.sims;
    $('#simProgress').attr("aria-valuenow",Math.floor(newProgressPct));
    $('#simProgress').css("width", newProgressPct + "%");
    gSim.progress = newProgress;
}


function SimCancel(params, stats) {
    gStop = true;
    $('#simButton').text("Stopping");
    $('#simButton').attr("disabled", true);
    for (let i = 0; i < gSimWorkers.length; i++) {
        gSimWorkers[i].postMessage({cmd: 'stop'});
    }
}

function SimResults() {
    let params = gSim.params;
    let stats = gSim.stats;
    let tickLength = 250;
    if (params.hyper) {
        tickLength *= 0.95;
    }
    if (params.slow) {
        tickLength *= 1.1;
    }
    let ticksPerHour = tickLength / 1000 / 3600;
    let hours = (stats.ticks * tickLength / 1000) / 3600;
    let maxSoldiers = params.patrols * params.patrolSize + params.defenders + params.garrison;
    
    LogResult(stats, " -- Results --\n");
    LogResult(stats, "Sims:  " + gSim.simsDone +
            ",  wall failures: " + stats.wallFails + 
            (stats.wallFails ? " (avg " + (stats.wallFailTicks * ticksPerHour / stats.wallFails).toFixed(1) + " hrs)" : "") +
            ",  patrol failures: " + stats.patrolFails +
            (stats.patrolFails ? " (avg " + (stats.patrolFailTicks * ticksPerHour / stats.patrolFails).toFixed(1) + " hrs)" : "") +
            "\n");
    LogResult(stats, "Soul gems per hour - Patrols: " + (stats.patrolGems / hours).toFixed(2) +
            ",  Surveyors: " + (stats.surveyorGems / hours).toFixed(2) + 
            ",  Guns: " + (stats.gunGems / hours).toFixed(2) +
            ",  Forge: " + (stats.forgeGems / hours).toFixed(2) +
            ",  Gate Turrets: " + (stats.gateGems / hours).toFixed(2) +
            ",  Total: " + ((stats.patrolGems + stats.surveyorGems + stats.gunGems + stats.forgeGems + stats.gateGems) / hours).toFixed(2) +
            "\n");
    LogResult(stats, "Encounters:  " + stats.patrolEncounters +
            ",  per hour: " + (stats.patrolEncounters / hours).toFixed(1) +
            ",  per bloodwar: " + (stats.patrolEncounters / stats.bloodWars).toFixed(3) +
            ",  skipped: " + (stats.skippedEncounters / (stats.skippedEncounters + stats.patrolEncounters) * 100).toFixed(2) + "%" +
            "\n");
    LogResult(stats, "Patrol kills per gem: " + (stats.patrolKills / stats.patrolGems).toFixed(2) +
            ", Drone kills per gem: " + (stats.droneKills / stats.surveyorGems).toFixed(2) + "\n");
    LogResult(stats, "Pre-fight Threat   Avg: " + (stats.totalPreFightThreat / stats.bloodWars).toFixed(0) + 
            ",  min: " + stats.minPreFightThreat +
            ",  max: " + stats.maxPreFightThreat +
            "\n");
    LogResult(stats, "Post-fight Threat  Avg: " + (stats.totalPostFightThreat / stats.bloodWars).toFixed(0) + 
            ",  min: " + stats.minPostFightThreat +
            ",  max: " + stats.maxPostFightThreat +
            "\n");
    LogResult(stats, "Soldiers killed per hour: " + (stats.soldiersKilled / hours).toFixed(1));
    if (params.revive) {
        LogResult(stats,
            ", after revives: " + ((stats.soldiersKilled - stats.soldiersRevived) / hours).toFixed(1)); 
    }
    LogResult(stats,
            ",  per bloodwar: " + (stats.soldiersKilled / stats.bloodWars).toFixed(3) +
            ",  in ambushes: " + (stats.ambushDeaths / stats.soldiersKilled * 100).toFixed(1) + "%" +
            "\n");
    if (params.hireMercs != "off") {
        LogResult(stats,
            "Mercs hired per hour: " + (stats.mercsHired / hours).toFixed(1) +
            ", avg cost: " + (stats.mercCosts / stats.mercsHired).toFixed(3) +
            ", max cost: " + stats.maxMercPrice.toFixed(3) +
            ", min money " + stats.minMoney.toFixed(2) +
            "\n");
    }
    LogResult(stats, "Patrols survived (of " + params.patrols +
            ")  avg: " + (stats.totalPatrolsSurvived / gSim.simsDone).toFixed(1) +
            ",  min: " + stats.minPatrolsSurvived +
            ",  max: " + stats.maxPatrolsSurvived +
            "\n");
    LogResult(stats, "Surveyors avg: " + (stats.totalSurveyors / stats.ticks).toFixed(1) +
            " (" + ((stats.totalSurveyors / stats.ticks) / params.surveyors * 100).toFixed(1) + "%)" +
            ",  min " + stats.minSurveyors + " of " + params.surveyors +
            "\n");
    LogResult(stats, "Hunting Garrison avg: " + (stats.totalGarrison / stats.ticks).toFixed(1) +
            " of " + params.garrison +
            " (" + ((stats.totalGarrison / stats.ticks) / params.garrison * 100).toFixed(1) + "%)" +
            "\n");
    LogResult(stats, "Walls avg: " + (stats.totalWalls / stats.bloodWars).toFixed(1) +
            ",  min " + stats.minWalls +
            "\n");
    
    if (params.extraResults) {
        LogResult(stats, "Blood wars:  " + stats.bloodWars + "\n");
        LogResult(stats, "Ambushes:    " + stats.ambushes +
            ",  per hour: " + (stats.ambushes / hours).toFixed(1) +
            ",  per bloodwar: " + (stats.ambushes / stats.bloodWars).toFixed(3) +
            ",  per encounter: " + (stats.ambushes / stats.patrolEncounters).toFixed(3) +
            "\n");
        LogResult(stats, "Surges:      " + stats.surges +
            ",  per hour: " + (stats.surges / hours).toFixed(3) +
            "\n");
        LogResult(stats, "Sieges:      " + stats.sieges +
            ",  per hour: " + (stats.sieges / hours).toFixed(3) +
            "\n");
        LogResult(stats, "Soldiers trained: " + stats.soldiersTrained +
            ",  per hour: " + (stats.soldiersTrained / hours).toFixed(1) +
            "\n");
        LogResult(stats, "Wounded avg: " + (stats.totalWounded / stats.bloodWars).toFixed(1) +
            ",  max " + stats.maxWounded + " of " + maxSoldiers +
            "\n");
        LogResult(stats, "Pity avg:    " + (stats.totalPity / stats.bloodWars).toFixed(0) +
            ",  max: " + stats.maxPity +
            ", avg per gem: " + (stats.totalPityPerGem / (stats.patrolGems + stats.surveyorGems)).toFixed(0) +
            "\n");
        LogResult(stats, "Demon kills per hour: " +
            (stats.kills / hours).toFixed(0) +
            "\n");
        LogResult(stats, "Soul Forge on-time: " + ((stats.forgeOn / stats.bloodWars) * 100).toFixed(1) + "%" +
            ", souls per hour: " + (stats.forgeSouls / hours).toFixed(0) +
            "\n");
        LogResult(stats, "Total sim time: " + ((Date.now() - gSim.startTime) / 1000).toFixed(1) + " seconds.  " +
            "Sim ticks per second: " + ((stats.ticks / ((Date.now() - gSim.startTime) / 1000)) / 1000).toFixed(1) + "k" +
            "\n");
    }

    $('#result')[0].scrollIntoView(true);
    $('#result')[0].value = stats.outputStr;
    $('#result').scrollTop($('#result')[0].scrollHeight);

    if (!gStop) {
        /* Restore the Simulate button after locking it briefly, to avoid accidentally
           starting a new sim if the user attempts to press stop just as it finishes */
        $('#simButton').text("Simulate");
        $('#simButton').attr("disabled", true);
        setTimeout(function() {
            $('#paramsForm').unbind("submit");
            $('#paramsForm').submit(function(event) {
                event.preventDefault();
                Simulate();
            });
            $('#simButton').attr("disabled", false);
        }, 250);
    } else {
        /* User already clicked stop, so just restore the Simulate button immediately */
        $('#simButton').text("Simulate");
        $('#paramsForm').unbind("submit");
        $('#paramsForm').submit(function(event) {
            event.preventDefault();
            Simulate();
        });
        $('#simButton').attr("disabled", false);
    }

    gStop = false;

}


function SetupSimWorkers () {
    var workersRequired;
    var i;
    
    /* Don't change anything if sim is in progress */
    if (gSim.simsActive != 0) {
        return;
    }
    
    if (Number.isFinite(gParams.cpuThreads)) {
        workersRequired = gParams.cpuThreads;
    } else {
        workersRequired = 1;
    }
    
    if (workersRequired > gParams.sims) {
        workersRequired = gParams.sims;
    }
    
    if (workersRequired == gSimWorkers.length) {
        return;
    }

    i = 0;
    /* Add new workers if necessary */
    while (i < workersRequired) {
        if (i >= gSimWorkers.length) {
            gSimWorkers[i] = new Worker('./js/worker.js');
            gSimWorkers[i].onmessage = SimWorkerHandler;
        }
    
        i++;
    }
    /* If number of required workers has decreased, terminate excessive workers */
    while (i < gSimWorkers.length) {
        gSimWorkers[i].terminate();
        
        i++;
    }
    /* Remove terminated workers from array */
    if (gSimWorkers.length > workersRequired) {
        gSimWorkers.splice(workersRequired, (gSimWorkers.length - workersRequired));
    }
    
    console.log("Sim Workers: " + gSimWorkers.length);
}


/*
    Every message has a 'cmd' field to specify the message type.  For each cmd, there may be other fields

    Messages FROM main TO worker:
        'info'                  - Request info for updating the UI for army rating, training rate, etc.
            params                  - Sim parameters
        'start'                 - Start a simulation
            id                      - Worker index ID
            simId                   - Sim number
            params                  - Sim parameters
            stats                   - Pre-initialized statistics
        'stop'                  - Stop the simulation
        
    Messages FROM worker TO main:
        'info'                  - Response to info request
            fortressRating          - Fortress combat rating
            patrolRating            - Normal patrol combat rating
            patrolRatingDroids      - Droid-augmented patrol combat rating
            trainingTime            - Soldier training time in ticks per soldier
            forgeSoldiers           - Number of soldiers required to run the Soul Forge
        'progress'              - Update for progress bar
            increment               - Progress increment as a percentage of the sim
        'done'                  - Simulation finished
            id                      - Worker index ID
            stats                   - Result stats
        'stopped'               - Simulation stopped after a stop request
            stats                   - Partial result stats
*/

function SimWorkerHandler(e) {
    switch (e.data.cmd) {
        case 'info':
            UpdateUIStrings(e);
            break;

        case 'progress':
            UpdateProgressBar(e.data.increment);
            break;

        case 'done':
            HandleSimDone(e.data.id, e.data.stats);
            break;

        case 'stopped':
            HandleSimStopped(e.data.stats);
            break;

        default:
            break;
    }
}

function HandleSimDone(id, stats) {
    gSim.simsActive--;
    gSim.simsDone++;
    
    MergeStats(gSim.stats, stats);
    
    if (gSim.simsDone == gSim.params.sims) {
        /* All done */
        SimResults();
        return;
    }
    
    if (gStop && gSim.simsActive == 0) {
        /* All sims stopped */
        LogResult(gSim.stats, "!!! Canceled !!!\n\n");
        SimResults();
        return;
    }
    
    /* Still more to go.  Update results box */
    if (!gSim.params.liteMode) {
        if (gSim.stats.outputStr.length < 4000) {
            $('#result')[0].value = gSim.stats.outputStr;
        } else {
            /* If the results get long, putting the whole thing in the results box starts
               to make everything go slow. */
            let idx = gSim.stats.outputStr.lastIndexOf('\n', gSim.stats.outputStr.length - 4000) + 1;
            $('#result')[0].value = gSim.stats.outputStr.slice(idx);
        }
        $('#result').scrollTop($('#result')[0].scrollHeight);
    }

    if (gSim.currentSim < gSim.params.sims && !gStop) {
        /* Start another sim. */
        gSim.currentSim++;
        gSimWorkers[id].postMessage({
            cmd: 'start',
            id: id,
            simId: gSim.currentSim,
            params: gSim.params,
            stats: InitStats(gSim.params)
        });
        gSim.simsActive++;
    }
}

function HandleSimStopped(stats) {
    gSim.simsActive--;

    if (gSim.simsActive == 0) {
        /* All sims stopped */
        LogResult(gSim.stats, "!!! Canceled !!!\n\n");
        SimResults();
    }
}

/* Update strings in the UI based on info response from worker
    e.data {
        fortressRating          - Fortress combat rating
        patrolRating            - Normal patrol combat rating
        patrolRatingDroids      - Droid-augmented patrol combat rating
        trainingTime            - Soldier training time in ticks per soldier
        forgeSoldiers           - Number of soldiers required to run the Soul Forge
    }
*/
function UpdateUIStrings(e) {
    ratingStr = "";
    if (gParams.cautious) {
        ratingStr += "~ ";
    }    
    if (gParams.patrols == 0) {
        ratingStr += e.data.patrolRating;
    } else if (gParams.droids >= gParams.patrols) {
        ratingStr += e.data.patrolRatingDroids;
    } else if (gParams.droids > 0) {
        ratingStr += e.data.patrolRating + " / " + e.data.patrolRatingDroids;
    } else {
        ratingStr += e.data.patrolRating;
    }
    $('#patrolRating').html(ratingStr);
    
    
    if (gParams.cautious) {
        ratingStr = "~ " + e.data.fortressRating;
    } else {
        ratingStr = e.data.fortressRating;
    }
    $('#fortressRating').html(ratingStr);
    
    /* Get the training time, then round up to next tick and convert to seconds */
    trainingTime = e.data.trainingTime;
    trainingTime = Math.ceil(trainingTime) / 4;
    if (gParams.hyper) {
        trainingTime *= 0.95;
    }
    if (gParams.slow) {
        trainingTime *= 1.1;
    }
    let trainingRate = 3600 / trainingTime;
    let trainingStr = trainingTime.toFixed(2) + "sec&nbsp;&nbsp;&nbsp;" + trainingRate.toFixed(1);
    var mercRate;
    switch (gParams.hireMercs) {
        case 'script':
        case 'governor':
            mercRate = 240;
            if (gParams.hyper) {
                mercRate /= 0.95;
            }
            if (gParams.slow) {
                mercRate /= 1.1;
            }
            trainingStr += "+" + Math.round(mercRate);
            break;
        case 'autoclick':
            mercRate = 240;
            let optimalClickerInterval = 15;
            if (gParams.hyper) {
                optimalClickerInterval /= 0.95;
                mercRate /= 0.95;
            }
            if (gParams.slow) {
                optimalClickerInterval /= 1.1;
                mercRate /= 1.1;
            }
            if (gParams.clickerInterval > optimalClickerInterval) {
                mercRate = (3600 / gParams.clickerInterval);
            }
            trainingStr += "+" + Math.round(mercRate);
            break;
        default:
            break;
    }
    trainingStr += "/hour"
    $('#trainingRate').html(trainingStr);
    
    /* It's impossible for the Soul Forge to be powered and unmanned (value 1) if there are
       more defenders than the forge requires.  This situation will happen any time a save
       is imported with the forge on because the save doesn't directly state whether it's
       manned, and we can't figure out out until we have the forgeSoldiers calculation. */
    if (gParams.soulForge == 1 && gParams.defenders >= e.data.forgeSoldiers) {
        $('#soulForge')[0].value = 2;
        $('#defenders')[0].value -= e.data.forgeSoldiers;
        /* This will cause another info request, which will defer to this function again, but
           with updated parameters.  Primary reason is that the fortressRating needs to be
           recalculated after changing the defender count. */
        OnChange();
    }
    if (gParams.soulForge == 2) {
        $('#forgeSoldiers').html(e.data.forgeSoldiers + " / " + e.data.forgeSoldiers + " soldiers");
    } else {
        $('#forgeSoldiers').html("0 / " + e.data.forgeSoldiers + " soldiers");
    }

}

function OnChange() {
    var patrolRating;
    var patrolRatingDroids;
    var fortressRating;
    var trainingTime;
    
    GetParams();

    /* If cpuThreads is invalid, set it to default based on user hardware.
       This will always happen on first load because the default in the html file is -1 */
    if (!Number.isFinite(gParams.cpuThreads) || gParams.cpuThreads < 1) {
        if (Number.isFinite(navigator.hardwareConcurrency)) {
            gParams.cpuThreads = Math.floor(navigator.hardwareConcurrency * 0.8);
            if (gParams.cpuThreads < 1) {
                gParams.cpuThreads = 1;
            }
        } else {
            gParams.cpuThreads = 2;
        }
        $('#cpuThreads')[0].value = gParams.cpuThreads;
    }
    
    /* Set up or adjust the number of sim workers */
    SetupSimWorkers(gParams);

    /* Request info from a worker.  It will reply with Army rating, training rate, etc.
       This is mainly to avoid duplicating the code for calculating these things. */
    if (gSimWorkers[0]) {
        gSimWorkers[0].postMessage({cmd: 'info', params: gParams});
    }
    
    ShowMercOptions();
    
    /* Show eldritch things only when needed */
    let eldritch = gParams.unfathomable > 0 || gParams.psychic > 0 || gParams.ocularPower > 0;
    if (eldritch) {
        $('#hEldritch').parent()[0].hidden = false;
        $('#cEldritch')[0].hidden = false;
    } else {
        $('#hEldritch').parent()[0].hidden = true;
        $('#cEldritch')[0].hidden = true;
    }
    
    /* Round dark energy to 3 places */
    $('#darkEnergy')[0].value = gParams.darkEnergy = +gParams.darkEnergy.toFixed(3);
    
    /* Manage collapsers */
    $('.collapser-icon').each(function(index, element) {
        var el = $(element);
        if (!eldritch && el[0].id == 'hEldritchStatus') {
            /* Skip */
        } else {
            let content = $(el.parent().data("target"));
            if (el.text() == "+") {
                content.hide(100);
            } else {
                content.show(100);
            }
        }
    });
    
    /* Save params to localStorage */
    window.localStorage.setItem('hellSimParams', JSON.stringify(gParams));
}

function ShowMercOptions() {
    switch (gParams.hireMercs) {
        case "script":
            $('#moneyIncomeDiv')[0].hidden = false;
            $('#moneyCapDiv')[0].hidden = false;
            $('#scriptCapThresholdDiv')[0].hidden = false;
            $('#scriptIncomeDiv')[0].hidden = false;
            $('#clickerIntervalDiv')[0].hidden = true;
            $('#mercBufferDiv')[0].hidden = false;
            $('#mercReserveDiv')[0].hidden = true;
            $('#mercsBlank1')[0].hidden = true;
            $('#mercsBlank2')[0].hidden = true;
            $('#mercsBlank3')[0].hidden = true;
            $('#mercsBlank4')[0].hidden = true;
            $('#mercsBlank5')[0].hidden = true;
            break;

        case "autoclick":
            $('#moneyIncomeDiv')[0].hidden = false;
            $('#moneyCapDiv')[0].hidden = false;
            $('#scriptCapThresholdDiv')[0].hidden = true;
            $('#scriptIncomeDiv')[0].hidden = true;
            $('#clickerIntervalDiv')[0].hidden = false;
            $('#mercBufferDiv')[0].hidden = true;
            $('#mercReserveDiv')[0].hidden = true;
            $('#mercsBlank1')[0].hidden = true;
            $('#mercsBlank2')[0].hidden = true;
            $('#mercsBlank3')[0].hidden = true;
            $('#mercsBlank4')[0].hidden = false;
            $('#mercsBlank5')[0].hidden = false;
            break;

        case "governor":
            $('#moneyIncomeDiv')[0].hidden = false;
            $('#moneyCapDiv')[0].hidden = false;
            $('#scriptCapThresholdDiv')[0].hidden = true;
            $('#scriptIncomeDiv')[0].hidden = true;
            $('#clickerIntervalDiv')[0].hidden = true;
            $('#mercBufferDiv')[0].hidden = false;
            $('#mercReserveDiv')[0].hidden = false;
            $('#mercsBlank1')[0].hidden = true;
            $('#mercsBlank2')[0].hidden = true;
            $('#mercsBlank3')[0].hidden = true;
            $('#mercsBlank4')[0].hidden = true;
            $('#mercsBlank5')[0].hidden = false;
            break;

        case "off":
        default:
            /* In case of invalid value here, make sure it's set to 'off' */
            gParams.hireMercs = 'off';
            $('#hireMercs')[0].value = "off";

            $('#moneyIncomeDiv')[0].hidden = true;
            $('#moneyCapDiv')[0].hidden = true;
            $('#scriptCapThresholdDiv')[0].hidden = true;
            $('#scriptIncomeDiv')[0].hidden = true;
            $('#clickerIntervalDiv')[0].hidden = true;
            $('#mercBufferDiv')[0].hidden = true;
            $('#mercReserveDiv')[0].hidden = true;
            $('#mercsBlank1')[0].hidden = false;
            $('#mercsBlank2')[0].hidden = false;
            $('#mercsBlank3')[0].hidden = false;
            $('#mercsBlank4')[0].hidden = false;
            $('#mercsBlank5')[0].hidden = false;
            break;
    } 
}

function LogResult(stats, str) {
    if (stats) {
        stats.outputStr += str;
    } else {
        let result = $('#result');
        result[0].value += str;
        result.scrollTop(result[0].scrollHeight);
    }
}

/* Pull parameter values from the form */
function GetParams() {
    gParams = {};

    $('.hell-sim-param').each(function(index, element) {
        var el = $(element);
        var id = el.attr('id');
        if (el.attr('type') == "checkbox") {
            if (jQuery(el).is(":checked")) {
                gParams[id] = true;
            } else {
                gParams[id] = false;
            }
        } else if (el.val() == "true") {
            gParams[id] = true;
        } else if (el.val() == "false") {
            gParams[id] = false;
        } else if (!isNaN(el.val())) {
            gParams[id] = Number(el.val());
        } else {
            gParams[id] = el.val();
        }
    });
    
    $('.collapser-icon').each(function(index, element) {
        var el = $(element);
        var id = el.attr('id');
        gParams[id] = el.text();
    });
    
}

/* Fill parameter values back to the form */
function SetParams() {
    console.log(gParams);
    for (const key of Object.keys(gParams)) {
        let id = "#" + key;
        let el = $(id);
        if (el.length && gParams[key] != null) {
            if (el.attr('type') == "checkbox") {
                el[0].checked = gParams[key];
            } else if (el.hasClass('collapser-icon')) {
                el.text(gParams[key].toString());
            } else if (el.prop('tagName') === "SELECT" && el.parents('#cTraits').length && typeof(gParams[key]) === "boolean") {
                /* convert data from before trait ranks */
                el.val(gParams[key] ? 1 : 0);
            } else {
                el.val(gParams[key].toString());
            }
        }
    }
}

function ImportSave() {
    if ($('#saveString').val().length > 0){
        let saveState = JSON.parse(LZString.decompressFromBase64($('#saveString').val()));
        if (saveState && 'evolution' in saveState && 'settings' in saveState && 'stats' in saveState && 'plasmid' in saveState.stats){
            ConvertSave(saveState);
            $('#result').val("Import successful!\n");
        } else {
            $('#result').val("Invalid save string\n");
        }
    } else {
        $('#result').val("Import requires save string\n");
    }
    $('#saveString').val("")
}

function ParseFathom(save, race) {
    if (save.city['surfaceDwellers']) {
        let idx = save.city.surfaceDwellers.indexOf(race);
        if (idx >= 0) {
            return save.city.captive_housing['race' + idx];
        }
    }
    return 0;
}

function ConvertSave(save) {
    console.log(save);
    
    /* Fill form fields based on Evolve save data */
    $('#aquatic')[0].checked = (save.race.species == "sharkin" || save.race.species == "octigoran");
    $('#banana')[0].checked = save.race['banana'] ? true : false;
    $('#magic')[0].checked = save.race.universe == 'magic' ? true : false;
    $('#rage')[0].checked = save.city.ptrait.includes('rage') ? true : false;
    $('#technophobe')[0].checked = save.stats.achieve['technophobe'] && save.stats.achieve.technophobe.l >= 5 ? true : false;
    $('#apexPredator')[0].value = save.race['apex_predator'] || 0;
    $('#armored')[0].value = save.race['armored'] || 0;
    $('#artifical')[0].value = save.race['artifical'] || 0;
    $('#beast')[0].value = save.race['beast'] || 0;
    $('#blurry')[0].value = save.race['blurry'] || 0;
    $('#brute')[0].value = save.race['brute'] || 0;
    $('#cannibal')[0].value = save.race['cannibalize'] || 0;
    $('#cautious')[0].value = save.race['cautious'] || 0;
    $('#chameleon')[0].value = save.race['chameleon'] || 0;
    $('#chicken')[0].value = save.race['chicken'] || 0;
    $('#claws')[0].value = save.race['claws'] || 0;
    $('#diverse')[0].value = save.race['diverse'] || 0;
    $('#elemental')[0].value = save.race['elemental'] || 0;
    $('#elusive')[0].value = save.race['elusive'] || 0;
    $('#evil')[0].value = save.race['evil'] || 0;
    $('#fiery')[0].value = save.race['fiery'] || 0;
    $('#ghostly')[0].value = save.race['ghostly'] || 0;
    $('#highPop')[0].value = save.race['high_pop'] || 0;
    $('#hivemind')[0].value = save.race['hivemind'] || 0;
    $('#holy')[0].value = save.race['holy'] || 0;
    $('#hyper')[0].value = save.race['hyper'] || 0;
    $('#instincts')[0].value = save.race['instinct'] || 0;
    $('#kindling')[0].value = save.race['kindling_kindred'] || 0;
    $('#ocularPower')[0].value = save.race['ocular_power'] || 0;
    $('#ooze')[0].value = save.race['ooze'] || 0;
    $('#parasite')[0].value = save.race['parasite'] || 0;
    $('#pathetic')[0].value = save.race['pathetic'] || 0;
    $('#psychic')[0].value = save.race['psychic'] || 0;
    $('#puny')[0].value = save.race['puny'] || 0;
    $('#rhinoRage')[0].value = save.race['rage'] || 0;
    $('#regenerative')[0].value = save.race['regenerative'] || 0;
    $('#revive')[0].value = save.race['revive'] || 0;
    $('#scales')[0].value = save.race['scales'] || 0;
    $('#slaver')[0].value = save.race['slaver'] || 0;
    $('#slow')[0].value = save.race['slow'] || 0;
    $('#slowRegen')[0].value = save.race['slow_regen'] || 0;
    $('#smoldering')[0].value = save.race['smoldering'] || 0;
    $('#sniper')[0].value = save.race['sniper'] || 0;
    $('#sticky')[0].value = save.race['sticky'] || 0;
    $('#unfathomable')[0].value = save.race['unfathomable'] || 0;

    $('#nightmare')[0].value =  save.stats.achieve['nightmare'] && save.stats.achieve.nightmare['mg'] || 0;
    $('#torturers')[0].value = save.civic['torturer'] && save.civic['torturer'].assigned || 0;
    $('#channel_assault')[0].value = save.race['psychicPowers'] && save.race.psychicPowers['channel'] && save.race.psychicPowers.channel['assault'] || 0;

    $('#ocular_disintegration')[0].checked = save.race['ocularPowerConfig'] && save.race.ocularPowerConfig['d'] ? true : false;
    $('#ocular_fear')[0].checked = save.race['ocularPowerConfig'] && save.race.ocularPowerConfig['f'] ? true : false;

    $('#antid_thralls')[0].value = ParseFathom(save, 'antid');
    $('#balorg_thralls')[0].value = ParseFathom(save, 'balorg');
    $('#centaur_thralls')[0].value = ParseFathom(save, 'centaur');
    $('#mantis_thralls')[0].value = ParseFathom(save, 'mantis');
    $('#orc_thralls')[0].value = ParseFathom(save, 'orc');
    $('#penguicula_thralls')[0].value = ParseFathom(save, 'penguicula');
    $('#rhinotaur_thralls')[0].value = ParseFathom(save, 'rhinotaur');
    $('#scorpid_thralls')[0].value = ParseFathom(save, 'scorpid');
    $('#sharkin_thralls')[0].value = ParseFathom(save, 'sharkin');
    $('#tortosian_thralls')[0].value = ParseFathom(save, 'tortosian');
    $('#troll_thralls')[0].value = ParseFathom(save, 'troll');
    $('#unicorn_thralls')[0].value = ParseFathom(save, 'unicorn');
    $('#wendigo_thralls')[0].value = ParseFathom(save, 'wendigo');
    $('#yeti_thralls')[0].value = ParseFathom(save, 'yeti');

    $('#zealotry')[0].checked = save.tech['fanaticism'] && save.tech['fanaticism'] >= 4 ? true : false;
    $('#vrTraining')[0].checked = save.tech['boot_camp'] && save.tech['boot_camp'] >= 2 ? true : false;
    $('#bacTanks')[0].checked = save.tech['medic'] && save.tech['medic'] >= 2 ? true : false;
    $('#shieldGen')[0].checked = save.tech['infernite'] && save.tech['infernite'] >= 5 ? true : false;
    $('#advDrones')[0].checked = save.tech['portal'] && save.tech['portal'] >= 7 ? true : false;
    $('#enhDroids')[0].checked = save.tech['hdroid'] && save.tech['hdroid'] >= 1 ? true : false;
    $('#soulAbsorption')[0].checked = save.tech['hell_pit'] && save.tech['hell_pit'] >= 6 ? true : false;
    $('#soulLink')[0].checked = save.tech['hell_pit'] && save.tech['hell_pit'] >= 7 ? true : false;
    $('#advGuns')[0].checked = save.tech['hell_gun'] && save.tech['hell_gun'] >= 2 ? true : false;

    $('#weaponTech')[0].value = save.tech['military'] ? (save.tech['military'] >= 5 ? save.tech['military'] - 1 : save.tech['military']) : 0;
    $('#armorTech')[0].value = save.tech['armor'] || 0;
    $('#turretTech')[0].value = save.tech['turret'] || 0;
    $('#tactical')[0].value = save.race['tactical'] || 0;
    $('#temples')[0].value = save.city.temple ? save.city.temple.count : 0;
    $('#government')[0].value = save.civic.govern.type || 'anarchy';
    $('#governor')[0].value = save.race['governor'] && save.race.governor['g'] ? save.race.governor.g.bg : 'none';
    $('#bootCamps')[0].value = save.city.boot_camp ? save.city.boot_camp.count : 0;
    $('#hospitals')[0].value = save.city.hospital ? save.city.hospital.count : 0;
    $('#fibroblast')[0].value = save.race['fibroblast'] || 0;
    let dark = save.prestige ? save.prestige.Dark.count : 0;
    dark *= 1 + ((save.prestige ? save.prestige.Harmony.count : 0) * 0.01);
    $('#darkEnergy')[0].value = save.race.universe == 'evil' ? dark.toFixed(3) : 0;
    $('#warRitual')[0].value = save.race['casting'] ? save.race.casting.army : 0;
    $('#bloodLust')[0].value = save['blood'] && save.blood['lust'] ? save.blood.lust : 0;
    $('#soulTrap')[0].value = save['blood'] && save.blood['attract'] ? save.blood.attract : 0;

    let governor = false;
    if (save.race['governor'] && save.race.governor['tasks']) {
        for (var task in save.race.governor.tasks) {
            if (save.race.governor.tasks[task] == "merc") {
                governor = true;
            }
        }
    }
    if (governor && $('#hireMercs')[0].value == "off") {
        $('#hireMercs')[0].value = "governor";
    } else if (!governor && $('#hireMercs')[0].value == "governor") {
        $('#hireMercs')[0].value = "off";
    }
    if (save.race.governor['config'] && save.race.governor.config['merc'] && save.race.governor.config.merc['buffer'] && save.race.governor.config.merc['reserve']) {
        $('#mercBuffer')[0].value = save.race.governor.config.merc['buffer'];
        $('#mercReserve')[0].value = save.race.governor.config.merc['reserve'];
    }
    
    $('#moneyCap')[0].value = save.resource['Money'] ? (save.resource.Money.max / 1000000).toFixed(2) : 0;
    $('#moneyIncome')[0].value = save.resource['Money'] ? (save.resource.Money.diff / 1000000).toFixed(2) : 0;
    
    if (save.portal && save.portal.fortress) {
        let patrols = save.portal.fortress.patrols;
        let patrolSize = save.portal.fortress.patrol_size;
        var defenders;
        var garrison;
        if (save.portal.fortress.assigned) {
            defenders = save.portal.fortress.assigned - (patrols * patrolSize);
            if (save.portal['guard_post']) {
                defenders -= save.portal.guard_post.on;
            }
            garrison = save.civic.garrison.max - save.civic.garrison.crew - save.portal.fortress.assigned;
        } else {
            defenders = 0;
            garrison = save.civic.garrison.max;
        }
        $('#patrols')[0].value = patrols;
        $('#patrolSize')[0].value = patrolSize;
        $('#defenders')[0].value = defenders;
        $('#garrison')[0].value = garrison;
        $('#surveyors')[0].value = save.portal.carport ? save.portal.carport.count : 0;
        $('#repairDroids')[0].value = save.portal.repair_droid ? save.portal.repair_droid.count : 0;
        $('#turrets')[0].value = save.portal.turret ? save.portal.turret.on : 0;
        $('#beacons')[0].value = save.portal.attractor ? save.portal.attractor.on : 0;
        $('#predators')[0].value = save.portal.war_drone ? save.portal.war_drone.on : 0;
        $('#droids')[0].value = save.portal.war_droid ? save.portal.war_droid.on : 0;
        $('#guns')[0].value = save.portal.gun_emplacement ? save.portal.gun_emplacement.on : 0;
        $('#soulAttractors')[0].value = save.portal.soul_attractor ? save.portal.soul_attractor.on : 0;
        $('#gateTurrets')[0].value = save.portal.gate_turret ? save.portal.gate_turret.on : 0;
        $('#soulForge')[0].value = save.portal.soul_forge ? save.portal.soul_forge.on : 0; /* Refine later in UpdateUIStrings() */
    } else {
        $('#patrols')[0].value = 0;
        $('#patrolSize')[0].value = 0;
        $('#defenders')[0].value = 0;
        $('#garrison')[0].value = 0;
        $('#surveyors')[0].value = 0;
        $('#repairDroids')[0].value = 0;
        $('#turrets')[0].value = 0;
        $('#beacons')[0].value = 0;
        $('#predators')[0].value = 0;
        $('#droids')[0].value = 0;
        $('#guns')[0].value = 0;
        $('#soulAttractors')[0].value = 0;
        $('#gateTurrets')[0].value = 0;
        $('#soulForge')[0].value = 0;
    }

    OnChange();
    
}

function GroupRow(containerQuery, rowQuery) {
    let row = $(rowQuery);
    let cols = row.children();
    let newRow = row;
    let i = Math.min(5, cols.length);
    for (; i < cols.length; i++) {
        if (i % 5 == 0) {
            newRow = $('<div>').prop({className: 'form-row'});
            $(containerQuery).append(newRow);
        }
        newRow.append(cols[i]);
    }
    while (i % 5 != 0) {
        newRow.append('<div class="form-group col-sm"></div>');
        i++;
    }
}

$(document).ready( function() {
    GroupRow("#cTraits", "#traitsRow");
    GroupRow("#cEldritch", "#thrallsRow");
    $('#cTraits')[0].hidden = false;
   
    $('#paramsForm').submit(function(event) {
        event.preventDefault();
        Simulate();
    });
    
    $('#importForm').submit(function(event) {
        event.preventDefault();
        ImportSave();
    });
    
    $('input').on('change', function() {
        OnChange();
    });
    $('select').on('change', function() {
        OnChange();
    });
    
    $('.collapser').mousedown(function(e){ e.preventDefault(); });
    $('.collapser').click(function() {
        let icon = $(this).children().first();
        if (icon.text() == "+") { // Currently collapsed
            icon.text("-");
        } else {
            icon.text("+");
        }
        OnChange();
    });

    /* Load params from localStorage */
    paramStr = window.localStorage.getItem('hellSimParams') || false;
    if (paramStr) {
        gParams = JSON.parse(paramStr);
        SetParams();
    }

    OnChange();

    console.log("Ready");
    $('#result').val("Ready\n");
});


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
    
    /* Recalculate current astrological sign */
    if (gSim.params.astrology == 'current') {
        gSim.params.astrology = GetStarSign();
    }
    
    /* Parse technophobe info */
    let technophobe_input = gSim.params.technophobe;
    if (technophobe_input >= 100) {
        gSim.params.technophobe = technophobe_input % 100;
        gSim.params.additional_technophobe_universes = Math.floor(technophobe_input / 100);
    } else {
        gSim.params.technophobe = Math.min(technophobe_input, 5);
        gSim.params.additional_technophobe_universes = Math.max(technophobe_input - 5, 0);
    }
    
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
        compactorGems: 0,
        curiousGems: 0,
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
        marginalEncounters: 0,
        ambushes: 0,
        soldiersTrained: 0,
        soldiersKilled: 0,
        soldiersRevived: 0,
        totalWounded: 0,
        maxWounded: 0,
        ambushDeaths: 0,
        woundedDeaths: 0,
        noDroidDeaths: 0,
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
        rainy: 0,
        wet: 0,
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
            (params.soul_compactor ? ",  Compactor: " + (stats.compactorGems / hours).toFixed(2) : "") +
            (params.curious ? ",  Curious: " + (stats.curiousGems / hours).toFixed(2) : "") +
            ",  Total: " + ((stats.patrolGems + stats.surveyorGems + stats.gunGems + stats.forgeGems + stats.gateGems + stats.compactorGems + stats.curiousGems) / hours).toFixed(2) +
            "\n");
    LogResult(stats, "Encounters:  " + stats.patrolEncounters +
            ",  per hour: " + (stats.patrolEncounters / hours).toFixed(1) +
            ",  per bloodwar: " + (stats.patrolEncounters / stats.bloodWars).toFixed(3) +
            ",  marginal: " + (stats.marginalEncounters / stats.bloodWars * 100).toFixed(2) + "%" + 
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
            ",  in wounded patrols: " + (stats.woundedDeaths / stats.soldiersKilled * 100).toFixed(1) + "%" +
            ",  with no droid: " + (stats.noDroidDeaths / stats.soldiersKilled * 100).toFixed(1) + "%" +
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
        if (params.cautious) {
            LogResult(stats, "Cautious weather penalty time: " + ((stats.rainy / stats.bloodWars) * 100).toFixed(1) + "%\n");
        }
        if (params.tusk) {
            LogResult(stats, "Tusked weather bonus time: " + ((stats.wet / stats.bloodWars) * 100).toFixed(1) + "%\n");
        }
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
    let ratingStr = "";
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
    
    /* Get the training rate in progress (%) per tick, convert to soldiers per hour */
    let trainingRate = e.data.trainingRate;
    let tickLength = e.data.tickLength; /* milliseconds */
    
    let soldierPerHour = (trainingRate / 100) * (1000 / tickLength) * 3600;
    let trainingTime = (tickLength / 1000) * (100 / trainingRate);
    let trainingStr = trainingTime.toFixed(2) + "sec&nbsp;&nbsp;&nbsp;" + soldierPerHour.toFixed(1);
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
    
    /* Show primordial things only when needed */
    let primordial = gParams.deep_power > 0;
    if (primordial) {
        $('#hPrimordial').parent()[0].hidden = false;
        $('#cPrimordial')[0].hidden = false;
    } else {
        $('#hPrimordial').parent()[0].hidden = true;
        $('#cPrimordial')[0].hidden = true;
    }
    
    /* Manage collapsers */
    $('.collapser-icon').each(function(index, element) {
        var el = $(element);
        if (!eldritch && el[0].id == 'hEldritchStatus') {
            /* Skip */
        } else if(!primordial && el[0].id == 'hPrimordialStatus') {
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

/* Old saved params may not match current format */
function UpdateParams() {
    if (gParams['technophobe'] && "boolean" == typeof gParams.technophobe) {
        gParams.technophobe = gParams.technophobe ? 5 : 0;
    }
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

function ParseSaveFormat(importString) {
    if (importString.startsWith('EvS1|')) {
        return [1, importString.slice(5)];
    } else if (importString.startsWith('EvS2|')) {
        return [2, importString.slice(5)];
    } else if (importString.startsWith('EvS3|')) {
        return [3, importString.slice(5)];
    } else {
        return false;
    }
}

function ParseSave(importString) {
    let formatArr = ParseSaveFormat(importString);
    if (!formatArr) return false;
    let format = formatArr[0];
    let b64 = formatArr[1];
    let bin = atob(b64);
    let arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    let text = fflate.strFromU8(fflate.inflateSync(arr));
    let object = JSON.parse(text);
    if (format == 1) return object;
    let shapes = object[0];
    
    function ParseObject(object) {
        if (object == null || typeof object !== 'object') return object;
        let tag = object[0];
        if (tag == -1) {
            let array = new Array(object.length - 1);
            for (let i = 1; i < object.length; i++) array[i - 1] = ParseObject(object[i]);
            return array;
        }
        let keys = shapes[tag];
        let parsed = {};
        for (let i = 1; i < object.length; i++) {
            let key = keys[i - 1];
            let value = ParseObject(object[i]);
            if (key === '__proto__') {
                Object.defineProperty(parsed, key, {
                    value: value,
                    writable: true,
                    enumerable: true,
                    configurable: true
                });
            } else {
                parsed[key] = value;
            }
        }
        return parsed;
    }
    
    let parsed = ParseObject(object[1]);
    
    // ship positions don't matter to us
    
    return parsed;
}

function ImportSave() {
    let importString = $('#saveString').val();
    if (importString.length > 0) {
        let saveState = ParseSave(importString);
        console.log(saveState);
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

function ParseTrait(save, trait, recessive, empowered_bonus) {
    let savedLevel = save.race[trait];
    if (!savedLevel) return 0;
    if (empowered_bonus > 0 && !(trait in recessive)) {
        return +(savedLevel + empowered_bonus).toFixed(6);
    }
    return savedLevel;
}

function ParseMinorTrait(save, trait) {
    let savedLevel = save.race[trait] || 0;
    if (savedLevel > 0 && save.race['geneSlots']) {
        let geneSlots = save.race['geneSlots'];
        for (let i = 0; i < geneSlots.length; i++) {
            if (geneSlots[i] && geneSlots[i].g === trait) {
                let bonded = geneSlots[i ^ 1];
                return bonded ? savedLevel : savedLevel / 2;
            }
        }
        return 0;
    } else {
        return savedLevel;
    }
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

function UniverseAffix(universe) {
    switch (universe) {
        case 'evil': return 'e';
        case 'antimatter': return 'a';
        case 'heavy': return 'h';
        case 'micro': return 'm';
        case 'magic': return 'mg';
        default: return 'l';
    }
}

function TraitScale(trait_rank, low, mid, high) {
    trait_rank = Math.max(0.1, Math.min(trait_rank || 1, 2.4));
    var a, b, t;
    if (trait_rank < 1) {
        a = low;
        b = mid;
        t = (trait_rank - 0.1) / 0.9;
    } else if (trait_rank <= 2) {
        a = mid;
        b = high;
        t = trait_rank - 1;
    } else {
        a = mid;
        b = high;
        t = 1 + (trait_rank - 2) / 2;
    }
    return +(a + (b - a) * t).toFixed(6);
}

function ConvertSave(save) {
    /* Fill form fields based on Evolve save data */
    $('#universe')[0].value = save.race.universe;
    $('#dark_energy')[0].value = save.prestige && save.prestige.Dark.count || 0;
    $('#harmony')[0].value = save.prestige && save.prestige.Harmony.count || 0;
    $('#evil_lemon')[0].value =  save.stats.achieve['extinct_sludge'] && save.stats.achieve.extinct_sludge['e'] || 0;
    $('#what_is_best')[0].value =  save.stats.achieve['what_is_best'] && save.stats.achieve.what_is_best['e'] || 0;
    $('#lamentis')[0].value =  save.stats.achieve['lamentis'] && save.stats.achieve.lamentis['l'] || 0;
    $('#biome')[0].value = save.city.biome;
    $('#orbit')[0].value = save.city.calendar.orbit;
    
    let harmonic_energy = 0;
    if (save['pillars']) {
        for (let key in save.pillars) {
            if (key == save.race.species) harmonic_energy += 4;
            else harmonic_energy++;
        }
    }
    $('#harmonic_energy')[0].value = harmonic_energy;
    
    $('#emfield')[0].checked = save.race['emfield'] ? true : false;
    $('#witch_hunter')[0].checked = save.race['witch_hunter'] ? true : false;
    $('#banana')[0].checked = save.race['banana'] ? true : false;
    $('#rage')[0].checked = save.city['ptrait'] && save.city.ptrait.includes('rage') ? true : false;
    $('#elliptical')[0].checked = save.city['ptrait'] && save.city.ptrait.includes('elliptical') ? true : false;
    $('#flare')[0].checked = save.city['ptrait'] && save.city.ptrait.includes('flare') ? true : false;
    $('#ancient_ruins')[0].checked = save.race['ancient_ruins'] ? true : false;
    $('#rejuvenated')[0].checked = save.race['rejuvenated'] ? true : false;
    let technophobe_l = save.stats.achieve['technophobe'] && save.stats.achieve.technophobe.l;
    let technophobe_additional = 0;
    let universes = ['e', 'a', 'h', 'm', 'mg'];
    for (let idx in universes) {
        if (save.stats.achieve['technophobe'] && save.stats.achieve.technophobe[universes[idx]] >= 5) {
            technophobe_additional++;
        }
    }
    $('#technophobe')[0].value = technophobe_l >= 5 ? 5 + technophobe_additional : technophobe_l + 100 * technophobe_additional;
    $('#bureaucratic_efficiency')[0].checked = save['genes'] && save.genes['governor'] && save.genes.governor >= 3 ? true : false;
    
    $('#aquatic')[0].checked = (save.race.species == "sharkin" || save.race.species == "octigoran");
    
    let empowerment = Math.min(2, save.race['empowered'] || 0);
    let empowered_genus_bonus = 0;
    let empowered_major_bonus = 0;
    if (empowerment > 0) {
        empowered_genus_bonus = TraitScale(empowerment, 0.005, 0.1, 0.2);
        empowered_major_bonus = TraitScale(empowerment, 0.01, 0.2, 0.4);
    }
    
    let strand_cap = 24;
    let strand_span = Math.max(strand_cap * 2, save.race['strandSpan'] || 0);
    
    let recessive_pairs = save.race['geneRecess'] || 0;
    // Is this actually used?
    if (save.race.species == 'custom') recessive_pairs += save.custom['race0']['recessive'] || 0;
    if (save.race.species == 'hybrid') recessive_pairs += save.custom['race1']['recessive'] || 0;
    
    // search backwards for recessive pairs (bite me)
    let recessive = {};
    if (save.race['geneSlots']) {
        let geneSlots = save.race['geneSlots'];
        let i = strand_span - 2;
        while (recessive_pairs > 0 && i >= 0) {
            let left = geneSlots[i];
            let right = geneSlots[i + 1];
            if (left || right) {
                if (left) recessive[left.g] = true;
                if (right) recessive[right.g] = true;
                recessive_pairs--;
            }
            i -= 2;
        }
    }
    // for(var r in recessive) {console.log("recessive: " + r);}
    
    // genus traits
    $('#artifical')[0].value = ParseTrait(save, 'artifical', recessive, empowered_genus_bonus);
    $('#beast')[0].value = ParseTrait(save, 'beast', recessive, empowered_genus_bonus);
    $('#cautious')[0].value = ParseTrait(save, 'cautious', recessive, empowered_genus_bonus);
    $('#connected')[0].value = ParseTrait(save, 'connected', recessive, empowered_genus_bonus);
    let deep_power_rank = ParseTrait(save, 'deep_power', recessive, empowered_genus_bonus);
    $('#deep_power')[0].value = deep_power_rank;
    $('#elusive')[0].value = ParseTrait(save, 'elusive', recessive, empowered_genus_bonus);
    $('#evil')[0].value = ParseTrait(save, 'evil', recessive, empowered_genus_bonus);
    let high_pop_rank = ParseTrait(save, 'high_pop', recessive, empowered_genus_bonus);
    $('#highPop')[0].value = high_pop_rank;
    $('#holy')[0].value = ParseTrait(save, 'holy', recessive, empowered_genus_bonus);
    $('#instincts')[0].value = ParseTrait(save, 'instinct', recessive, empowered_genus_bonus);
    $('#psychic')[0].value = ParseTrait(save, 'psychic', recessive, empowered_genus_bonus);
    $('#scales')[0].value = ParseTrait(save, 'scales', recessive, empowered_genus_bonus);
    $('#smoldering')[0].value = ParseTrait(save, 'smoldering', recessive, empowered_genus_bonus);
    $('#unfathomable')[0].value = ParseTrait(save, 'unfathomable', recessive, empowered_genus_bonus);
    
    // major traits
    $('#aggressive')[0].value = ParseTrait(save, 'aggressive', recessive, empowered_major_bonus);
    $('#apexPredator')[0].value = ParseTrait(save, 'apex_predator', recessive, empowered_major_bonus);
    $('#astrologer')[0].value = ParseTrait(save, 'astrologer', recessive, empowered_major_bonus);
    $('#armored')[0].value = ParseTrait(save, 'armored', recessive, empowered_major_bonus);
    $('#blurry')[0].value = ParseTrait(save, 'blurry', recessive, empowered_major_bonus);
    $('#brute')[0].value = ParseTrait(save, 'brute', recessive, empowered_major_bonus);
    $('#cannibal')[0].value = ParseTrait(save, 'cannibalize', recessive, empowered_major_bonus);
    $('#chameleon')[0].value = ParseTrait(save, 'chameleon', recessive, empowered_major_bonus);
    $('#chicken')[0].value = ParseTrait(save, 'chicken', recessive, empowered_major_bonus);
    $('#claws')[0].value = ParseTrait(save, 'claws', recessive, empowered_major_bonus);
    $('#curious')[0].value = ParseTrait(save, 'curious', recessive, empowered_major_bonus);
    $('#diverse')[0].value = ParseTrait(save, 'diverse', recessive, empowered_major_bonus);
    $('#elemental')[0].value = ParseTrait(save, 'elemental', recessive, empowered_major_bonus);
    $('#fiery')[0].value = ParseTrait(save, 'fiery', recessive, empowered_major_bonus);
    $('#ghostly')[0].value = ParseTrait(save, 'ghostly', recessive, empowered_major_bonus);
    $('#grenadier')[0].value = ParseTrait(save, 'grenadier', recessive, empowered_major_bonus);
    $('#hivemind')[0].value = ParseTrait(save, 'hivemind', recessive, empowered_major_bonus);
    $('#humongous')[0].value = ParseTrait(save, 'humongous', recessive, empowered_major_bonus);
    $('#hyper')[0].value = ParseTrait(save, 'hyper', recessive, empowered_major_bonus);
    $('#kindling')[0].value = ParseTrait(save, 'kindling_kindred', recessive, empowered_major_bonus);
    $('#ocularPower')[0].value = ParseTrait(save, 'ocular_power', recessive, empowered_major_bonus);
    $('#ooze')[0].value = ParseTrait(save, 'ooze', recessive, empowered_major_bonus);
    $('#parasite')[0].value = ParseTrait(save, 'parasite', recessive, empowered_major_bonus);
    $('#pathetic')[0].value = ParseTrait(save, 'pathetic', recessive, empowered_major_bonus);
    $('#puny')[0].value = ParseTrait(save, 'puny', recessive, empowered_major_bonus);
    $('#rhinoRage')[0].value = ParseTrait(save, 'rage', recessive, empowered_major_bonus);
    $('#regenerative')[0].value = ParseTrait(save, 'regenerative', recessive, empowered_major_bonus);
    $('#revive')[0].value = ParseTrait(save, 'revive', recessive, empowered_major_bonus);
    $('#rogue')[0].value = ParseTrait(save, 'rogue', recessive, empowered_major_bonus);
    $('#slaver')[0].value = ParseTrait(save, 'slaver', recessive, empowered_major_bonus);
    $('#slow')[0].value = ParseTrait(save, 'slow', recessive, empowered_major_bonus);
    $('#slowRegen')[0].value = ParseTrait(save, 'slow_regen', recessive, empowered_major_bonus)
    $('#sniper')[0].value = ParseTrait(save, 'sniper', recessive, empowered_major_bonus);
    $('#sticky')[0].value = ParseTrait(save, 'sticky', recessive, empowered_major_bonus);
    $('#swift')[0].value = ParseTrait(save, 'swift', recessive, empowered_major_bonus);
    $('#tusk')[0].value = ParseTrait(save, 'tusk', recessive, empowered_major_bonus);
    $('#unfavored')[0].value = ParseTrait(save, 'unfavored', recessive, empowered_major_bonus);

    $('#nightmare')[0].value =  save.stats.achieve['nightmare'] && save.stats.achieve.nightmare['mg'] || 0;
    $('#torturers')[0].value = save.civic['torturer'] && save.civic['torturer'].assigned || 0;
    $('#channel_assault')[0].value = save.race['psychicPowers'] && save.race.psychicPowers['channel'] && save.race.psychicPowers.channel['assault'] || 0;

    $('#ocular_disintegration')[0].checked = save.race['ocularPowerConfig'] && save.race.ocularPowerConfig['d'] ? true : false;
    $('#ocular_fear')[0].checked = save.race['ocularPowerConfig'] && save.race.ocularPowerConfig['f'] ? true : false;

    $('#deep_power_combat')[0].checked = save.race['deepPowerConfig'] && save.race.deepPowerConfig['combat'] || 0;

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
    $('#astroWish')[0].checked = save.race['wishStats'] && save.race.wishStats['astro'] ? true : false;

    $('#weaponTech')[0].value = save.tech['military'] ? (save.tech['military'] >= 5 ? save.tech['military'] - 1 : save.tech['military']) : 0;
    $('#armorTech')[0].value = save.tech['armor'] || 0;
    $('#turretTech')[0].value = save.tech['turret'] || 0;
    $('#temples')[0].value = save.city.temple ? save.city.temple.count : 0;
    $('#authority')[0].value = save.resource['Authority'] && save.resource['Authority'].amount || 0;
    $('#government')[0].value = save.civic.govern.type || 'anarchy';
    $('#governor')[0].value = save.race['governor'] && save.race.governor['g'] ? save.race.governor.g.bg : 'none';
    $('#bootCamps')[0].value = save.city.boot_camp ? save.city.boot_camp.count : 0;
    $('#hospitals')[0].value = save.city.hospital ? save.city.hospital.count : 0;
    $('#warRitual')[0].value = save.race['casting'] ? save.race.casting.army : 0;
    $('#bloodLust')[0].value = save['blood'] && save.blood['lust'] ? save.blood.lust : 0;
    $('#soulTrap')[0].value = save['blood'] && save.blood['attract'] ? save.blood.attract : 0;

    $('#ambusher')[0].value = ParseMinorTrait(save, 'ambusher');
    $('#fibroblast')[0].value = ParseMinorTrait(save, 'fibroblast');
    $('#infernal')[0].value = ParseMinorTrait(save, 'infernal');
    $('#mycelial')[0].value = ParseMinorTrait(save, 'mycelial');
    $('#radiant')[0].value = ParseMinorTrait(save, 'radiant');
    $('#tactical')[0].value = ParseMinorTrait(save, 'tactical');
    $('#zealot')[0].value = ParseMinorTrait(save, 'zealot');

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
        let popFactor = 1;
        if (high_pop_rank > 0) {
            popFactor = TraitScale(high_pop_rank, 2, 4, 7);
        }
        $('#patrols')[0].value = patrols;
        $('#patrolSize')[0].value = patrolSize;
        $('#defenders')[0].value = defenders;
        $('#garrison')[0].value = garrison;
        $('#surveyors')[0].value = save.portal.carport ? Math.round(popFactor * save.portal.carport.count) : 0;
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

    $('#soul_bait')[0].checked = save.tech['hell_pit'] && save.tech.hell_pit >= 8 ? true : false;
    /* "Soul Power" enables the tech 5 event which is random, just assume it will happen */
    $('#asphodel_hostility')[0].checked = save.tech['asphodel'] && save.tech.asphodel >= 4 ? true : false;
    $('#asphodel_mech_security')[0].checked = save.tech['asphodel'] && save.tech.asphodel >= 6 ? true : false;
    $('#dimensional_tap')[0].checked = save.tech['science'] && save.tech.science >= 24 &&
        save['interstellar'] && save.interstellar['ascension_trigger'] && save.interstellar.ascension_trigger.on >= 1 ?
        true : false;
    $('#spectral_training')[0].checked = save.tech['celestial_warfare'] && save.tech.celestial_warfare >= 5 ? true : false;
    $('#soul_compactor')[0].checked = save['eden'] && save.eden['soul_compactor'] && save.eden.soul_compactor.count >= 1 ? true : false;
    $('#suction_force')[0].checked = save.tech['isle'] && save.tech.isle >= 6 ? true : false;
    
    $('#ghost_trappers')[0].value = save.civic['ghost_trapper'] && save.civic['ghost_trapper'].assigned || 0;
    $('#mech_station_effect')[0].value = save['eden'] && save.eden['mech_station'] && save.eden.mech_station.count >= 10 && save.eden.mech_station.effect || 0;
    $('#thermal_collectors')[0].value = save['interstellar'] && save.interstellar['thermal_collector'] && save.interstellar.thermal_collector.count || 0;
    $('#bunkers')[0].value = save['eden'] && save.eden['bunker'] && save.eden.bunker.on || 0;
    $('#vacuums')[0].value = save['eden'] && save.eden['spirit_vacuum'] && save.eden.spirit_vacuum.on || 0;
    $('#batteries')[0].value = save['eden'] && save.eden['spirit_battery'] && save.eden.spirit_battery.on || 0;

    let mastery = 0; // mastery in percentage points
    let challenge_gene = save.genes['challenge'] || 0;
    if (challenge_gene >= 2) {
        let standard_pip_count = 0;
        let universe_pip_count = 0;
        
        let universe = save.race.universe;
        let affix = UniverseAffix(universe);
        let standard_affix = UniverseAffix('standard');
        for (let achievement_name in save.stats.achieve) {
            let achievement = save.stats.achieve[achievement_name]; 
            standard_pip_count += Math.min(5, achievement[standard_affix] || 0);
            universe_pip_count += Math.min(5, achievement[affix] || 0);
        }
        
        let is_standard = (universe == 'standard');
        let is_antimatter = (universe == 'antimatter');
        
        let general_mastery_rate = 0.25;
        let universe_mastery_rate = 0;
        if (!is_standard) {
            if (challenge_gene >= 4) {
                general_mastery_rate = 0.20;
                universe_mastery_rate = 0.10;
            } else if (challenge_gene >= 3) {
                general_mastery_rate = 0.15;
                universe_mastery_rate = 0.15;
            } else {
                general_mastery_rate = 0.15;
                universe_mastery_rate = 0.10;
            }
        }
        
        let grandmaster = save.stats.feat['grandmaster'] || 0;
        let corrupted = save.stats.achieve['corrupted'] ? save.stats.achieve.corrupted['l'] || 0 : 0;
        if (grandmaster >= 1 && corrupted >= 1) {
            let grandmaster_perk_level = Math.min(grandmaster, corrupted);
            general_mastery_rate *= 1 + grandmaster_perk_level / 100;
            universe_mastery_rate *= 1 + grandmaster_perk_level / 100;
        }
        
        if (is_antimatter && save.race['weak_mastery']) {
            general_mastery_rate /= 10;
            universe_mastery_rate /= 10;
        }
        if (save.race['nerfed']) { // true path, we don't really care, but sure
            let divisor = is_antimatter ? 5 : 2;
            general_mastery_rate /= divisor;
            universe_mastery_rate /= divisor;
        }
        let ooze = ParseTrait(save, 'ooze', recessive, empowered_major_bonus);
        if (ooze > 0) {
            let modifier = 1 - TraitScale(ooze, 50, 30, 18) / 100;
            general_mastery_rate *= modifier;
            universe_mastery_rate *= modifier;
        }
        if (challenge_gene >= 5) {
            let mastery_genes = ParseMinorTrait(save, 'mastery');
            let modifier = 1 + mastery_genes / 100;
            general_mastery_rate *= modifier;
            universe_mastery_rate *= modifier;
        }
        if (deep_power_rank > 0) {
            let modifier = 1 + TraitScale(deep_power_rank, 0, 12, 22);
            general_mastery_rate *= modifier;
            universe_mastery_rate *= modifier;
        }
        // TODO: herbivore trophies
        
        let general_mastery = general_mastery_rate * standard_pip_count;
        let universe_mastery = universe_mastery_rate * universe_pip_count;
        
        // console.log("general mastery: " + general_mastery + " " + general_mastery_rate + " " + standard_pip_count);
        // console.log("universe mastery: " + universe_mastery + " " + universe_mastery_rate + " " + universe_pip_count);
        
        // Ideally, we wouldn't have to round
        mastery = +(general_mastery + universe_mastery).toFixed(3);
    }

    $('#mastery')[0].value = mastery;

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

function GetStarSign() {
    let date = new Date();
    if (date.getMonth() === 1 && date.getDate() >= 19 || date.getMonth() == 2 && date.getDate() <= 20) {
        return 'pisces';
    } else if (date.getMonth() == 2 && date.getDate() >= 21 || date.getMonth() == 3 && date.getDate() <= 19) {
        return 'aries';
    } else if (date.getMonth() == 5 && date.getDate() >= 22 || date.getMonth() == 6 && date.getDate() <= 22) {
        return 'cancer';
    } else {
        return 'other';
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
        UpdateParams();
        SetParams();
    }

    OnChange();

    console.log("Ready");
    $('#result').val("Ready\n");
});


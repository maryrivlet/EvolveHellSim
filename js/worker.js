var gStop = false;

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
            tickLength              - Length of a tick in milliseconds
            trainingRate            - Training progress (%) per tick
            forgeSoldiers           - Number of soldiers required to run the Soul Forge
        'progress'              - Update for progress bar
            increment               - Progress increment as a percentage of the sim
        'done'                  - Simulation finished
            id                      - Worker index ID
            stats                   - Result stats
        'stopped'               - Simulation stopped after a stop request
            stats                   - Partial result stats
*/
onmessage = function(e) {
    switch (e.data.cmd) {
        case 'info':
            ProvideInfo(e.data.params);
            break;
        case 'start':
            SimStart(e.data.id, e.data.simId, e.data.params, e.data.stats);
            break;
        case 'stop':
            gStop = true;
            break;
        default:
            break;
    }
    
    return;
}

function SimStart(id, simId, params, stats) {
    let tickLength = TickLength(params);
    var sim = {
        id: id,
        simId: simId,
        tick: 0,
        ticks: Math.round(params.hours * 3600 * 1000 / tickLength),
        tickLength: tickLength,
        threat: params.threat,
        patrols: params.patrols,
        soldiers: params.patrols * params.patrolSize + params.garrison + params.defenders,
        maxSoldiers: params.patrols * params.patrolSize + params.garrison + params.defenders,
        hellSoldiers: params.patrols * params.patrolSize + params.defenders,
        maxHellSoldiers: params.patrols * params.patrolSize + params.defenders,
        patrolRating: 0,
        patrolRatingDroids: 0,
        wounded: 0,
        trainingProgress: 0,
        trainingRate: 0,
        surveyors: params.surveyors,
        carRepair: 0,
        siegeOdds: 999,
        walls: 100,
        wallRepair: 0,
        pity: 0,
        eventOdds: 999,
        forgeSouls: 0,
        compactor_energy: 0,
        money: params.moneyCap,
        mercCounter: 0,
        clickerCounter: 0,
        day: Rand(0, params.orbit),
        temp: 1,
        weather: 0,
        lastEvent: -1,
        progress: 0,
        done: false
    };
    if (params.soulForge == 2) {
        let forgeSoldiers = ForgeSoldiers(params);
        sim.soldiers += forgeSoldiers;
        sim.maxSoldiers += forgeSoldiers;
        sim.hellSoldiers += forgeSoldiers;
        sim.maxHellSoldiers += forgeSoldiers;
    }
    /* Calculate patrol rating and training rate ahead of time for efficiency */
    sim.patrolRating = ArmyRating(params, false, params.patrolSize);
    sim.patrolRatingDroids = ArmyRating(params, false, params.patrolSize + DroidSize(params));
    sim.trainingRate = TrainingRate(params);

    LogResult(stats, " -- Sim " + sim.simId.toString().padStart(Math.floor(Math.log10(params.sims)) + 1, 0) + " --\n");

    gStop = false;

    SimScheduler(params, sim, stats);
}

function SimScheduler(params, sim, stats) {
    if (gStop) {
        SimCancel(sim, params, stats);
    } else {
        setTimeout(function() {
            SimRun(sim, params, stats);
        }, 0);
    }
}

function ProvideInfo (params) {
    var fortressRating;
    var patrolRating;
    var patrolRatingDroids;
    var tickLength;
    var trainingRate;
    var forgeSoldiers;
    
    fortressRating = FortressRating(params, false);
    patrolRating = ArmyRating(params, false, params.patrolSize);
    patrolRatingDroids = ArmyRating(params, false, params.patrolSize + DroidSize(params));
    tickLength = TickLength(params);
    trainingRate = TrainingRate(params);
    forgeSoldiers = ForgeSoldiers(params);

    self.postMessage({
        cmd: 'info',
        fortressRating: fortressRating,
        patrolRating: patrolRating,
        patrolRatingDroids: patrolRatingDroids,
        tickLength: tickLength,
        trainingRate: trainingRate,
        forgeSoldiers: forgeSoldiers
    });
}



function SimRun(sim, params, stats) {
    const ticks_per_bloodwar = 20;
    var startTime = Date.now();
    var newProgress;
    var progressIncrement;
    
    while (sim.tick < sim.ticks) {
        if (sim.tick % ticks_per_bloodwar == 0) {
            if (params.cautious || params.tusk) {
                UpdateWeather(sim, params, stats);
            }
            
            /* Fight demons */
            BloodWar(params, sim, stats);
            
            /* End the sim if all patrols are dead or the walls fell */
            if (sim.walls == 0) {
                stats.wallFails++;
                stats.wallFailTicks += sim.tick;
                break;
            } else if (sim.patrols == 0 && params.patrols != 0) {
                stats.patrolFails++;
                stats.patrolFailTicks += sim.tick;
                break;
            }
            
            if (sim.wounded > 0) {
                HealSoldiers(params, sim, stats);
            }
            
            if (params.hireMercs == "governor") {
                HireMercs(params, sim, stats);
            }
            
            /* Random events, which could mean a demon surge influx */
            Events(params, sim, stats);
            
            /* 1/3 chance to reduce merc counter -- we assume Signing Bonus was researched. */
            if (sim.mercCounter > 0) {
                let rolls = PopFactor(params);
                for (let i = 0; i < rolls && sim.mercCounter > 0; i++) {
                    if (Rand(0,3) == 0) {
                        sim.mercCounter--;
                    }
                }
            }
        }
        
        if (sim.soldiers < sim.maxSoldiers) {
            TrainSoldiers(params, sim, stats);
        }
        sim.money += params.moneyIncome * (sim.tickLength / 1000);
        if (sim.money > params.moneyCap) {
            sim.money = params.moneyCap;
        }
        if (params.hireMercs == "script" || params.hireMercs == "autoclick") {
            HireMercs(params, sim, stats);
        }
        stats.totalGarrison += (sim.soldiers - sim.hellSoldiers);
        
        stats.totalSurveyors += sim.surveyors;
        stats.minSurveyors = Math.min(stats.minSurveyors, sim.surveyors);
        if (sim.surveyors < params.surveyors) {
            RepairSurveyors(params, sim, stats);
        }
        
        /* Repair walls */
        if (sim.walls < 100) {
            let repair = 200;
            if (params.repairDroids > 0) {
                repair *= 0.95 ** params.repairDroids;
                repair = Math.round(repair);
            }
            sim.wallRepair++;
            if (sim.wallRepair >= repair) {
                sim.wallRepair = 0;
                sim.walls++;
            }
        }
        
        /* Spirit Vacuum */
        Vacuum(params, sim, stats);
        
        sim.tick++;
        stats.ticks++;
        
        if (sim.tick % ticks_per_bloodwar == 0) {
            newProgress = Math.floor(100 * sim.tick / sim.ticks);
            progressIncrement = newProgress - sim.progress;
            if (progressIncrement >= 1 || newProgress == 100) {
                self.postMessage({
                    cmd: 'progress',
                    increment: progressIncrement
                });
                sim.progress = newProgress;
            }
            /* Only check the time occasionally.  Checking on every tick is bad for performance */
            let msElapsed = Date.now() - startTime;
            if (msElapsed > 50) {
                /* Yield CPU */
                SimScheduler(params, sim, stats);
                return;
            }
        }
        
        if (gStop) {
            SimCancel(sim, params, stats);
            return;
        }
    }
    if (sim.tick >= sim.ticks) {
        LogResult(stats, "Survived!\n");
        LogResult(stats, "Defenders: " + (sim.hellSoldiers - sim.patrols * params.patrolSize) + 
            ",  Garrison: " + (sim.soldiers - sim.hellSoldiers) + 
            ",  Walls: " + sim.walls + 
            "\n");
        LogResult(stats, "Patrols remaining: " + sim.patrols + " out of " + params.patrols + "\n");
        LogResult(stats, "\n");
    }
    
    /* Report any remaining unreported progress.  Every finished sim should report 100% even if
       it fails early. */
    if (sim.progress < 100) {
        progressIncrement = 100 - sim.progress;
        self.postMessage({
            cmd: 'progress',
            increment: progressIncrement
        });
    }
    
    stats.totalPatrolsSurvived += sim.patrols;
    stats.minPatrolsSurvived = Math.min(sim.patrols, stats.minPatrolsSurvived);
    stats.maxPatrolsSurvived = Math.max(sim.patrols, stats.maxPatrolsSurvived);
    
    sim.done = true;
    
    /* Report finished results */
    self.postMessage({
        cmd: 'done',
        id: sim.id,
        stats: stats
    });
}

function SimCancel(sim, params, stats) {
    self.postMessage({
        cmd: 'stopped',
        stats: stats
    });
}


function BloodWar(params, sim, stats) {
    stats.bloodWars++;
    stats.totalPreFightThreat += sim.threat;
    if (sim.threat < stats.minPreFightThreat) {
        stats.minPreFightThreat = sim.threat;
    }
    if (sim.threat > stats.maxPreFightThreat) {
        stats.maxPreFightThreat = sim.threat;
    }
    let preFightThreat = sim.threat;
    
    stats.totalWounded += sim.wounded;
    if (sim.wounded > stats.maxWounded) {
        stats.maxWounded = sim.wounded;
    }
    
    stats.totalPity += sim.pity;
    stats.maxPity = Math.max(stats.maxPity, sim.pity);
    
    LogVerbose(sim, params,
        "T " + sim.tick + 
        " ; soldiers " + sim.soldiers +
        " ; hellSoldiers " + sim.hellSoldiers +
        " ; threat " + sim.threat);

    /* Check whether enough soldiers are currently available to keep the soul forge running */
    let forgeOperating = false;
    if (params.soulForge >= 1) {
        let defenders = sim.hellSoldiers - (sim.patrols * params.patrolSize);
        let forgeSoldiers = ForgeSoldiers(params);
        if (defenders >= forgeSoldiers) {
            forgeOperating = true;
            stats.forgeOn++;
        }
    }
    let forgeSouls = 0;

    /* Drone Strikes */
    let droneKills = 0;
    for (let i = 0; i < params.predators; i++) {
        if (Rand(0, sim.threat) >= Rand(0, 999)) {
            let minDemons = Math.floor(sim.threat / 50);
            let maxDemons = Math.floor(sim.threat / 10);
            let demons = Rand(minDemons, maxDemons);
            let kills = params.advDrones ? Rand(50, 125) : Rand(25, 75);
            if (kills > demons) {
                kills = demons;
            }
            sim.threat -= kills;
            if (forgeOperating) {
                forgeSouls += kills;
            }
            stats.kills += kills;
            stats.droneKills += kills;
            droneKills += kills;
        }
    }
    
    /* Gem Chance */
    let gemOdds = params.technophobe >= 5 ? 9000 : 10000;
    gemOdds -= sim.pity;
    gemOdds = Math.round(gemOdds * (0.948 ** params.beacons));
    if (params.ghostly) {
        gemOdds = Math.round(gemOdds * TraitSelect(params.ghostly, 0.98, 0.95, 0.9, 0.85, 0.8, 0.78, 0.77));
    }
    if (params.wendigo_thralls) {
        gemOdds = Math.round(gemOdds * (0.01 * (100 - 10 * Fathom(params, params.wendigo_thralls))));
    }
    if (gemOdds < 12) {
        gemOdds = 12;
    }
    
    /* Patrols */
    let soldiersKilled = 0;
    let needPity = true;
    /* Update patrol rating if cautious/tusked, for random weather */
    if (params.cautious || params.tusk) {
        sim.patrolRating = ArmyRating(params, sim, params.patrolSize);
        sim.patrolRatingDroids = ArmyRating(params, sim, params.patrolSize + DroidSize(params));
    }
    let patrolWounds = 0;
    let extraWounds = 0;
    if (sim.wounded > 0) {
        /* Figure out how many wounds to assign to patrols */
        let defenders = sim.hellSoldiers - (sim.patrols * params.patrolSize);
        let garrison = sim.soldiers - sim.hellSoldiers;
        let patrolWoundTotal = sim.wounded - garrison - defenders;
        if (patrolWoundTotal > 0) {
            patrolWounds = Math.floor(patrolWoundTotal / sim.patrols);
            extraWounds = patrolWoundTotal % sim.patrols;
        }
    }
    let droids = params.droids;
    for (let i = 0; i < sim.patrols; i++) {
        /* Check for encounter
           Less demons -> lower chance of encounter
         */
        let wounded = patrolWounds;
        if (i < extraWounds) {
            wounded++;
        }
        if (Rand(0, sim.threat) >= Rand(0, 999)) {
            /* Encounter */
            stats.patrolEncounters++;
            
            var patrolRating;
            /* If no wounded, use alread-calculated patrol rating to save time */
            if (wounded == 0) {
                if (droids > 0) {
                    patrolRating = sim.patrolRatingDroids;
                    droids--;
                } else {
                    patrolRating = sim.patrolRating;
                }
            } else {
                let patrolSize = params.patrolSize;
                if (droids > 0) {
                    patrolSize += DroidSize(params);
                    droids--;
                }
                patrolRating = ArmyRating(params, sim, patrolSize, wounded);
            }
            
            let minDemons = Math.floor(sim.threat / 50);
            let maxDemons = Math.floor(sim.threat / 10);
            let demons = Rand(minDemons, maxDemons);
            
            let ambushOdds = 30 + Math.max(params.elusive ? TraitSelect(params.elusive, 5, 10, 15, 20, 25, 30, 35) : 0, params.chameleon ? TraitSelect(params.chameleon, 5, 10, 15, 20, 25, 30, 35) : 0);
            if (params.chicken) {
                ambushOdds -= TraitSelect(params.chicken, 22, 20, 15, 10, 8, 6, 4);
            }
            if (params.ocularPower && params.ocular_fear) {
                ambushOdds += TraitSelect(params.ocularPower, 0, 1, 2, 2, 3, 4, 5);
            }
            
            if (Rand(0, ambushOdds) == 0) {
                /* Ambush 
                   Patrol armor is ignored, at least one will be killed/injured, and no chance for a soul gem
                 */
                stats.ambushes++;

                soldiersKilled += PatrolCasualties(params, sim, stats, demons, true);
                let demonsKilled = Math.round(patrolRating / 2);
                if (demonsKilled < demons) {
                    sim.threat -= demonsKilled;
                    if (forgeOperating) {
                        forgeSouls += demonsKilled;
                    }
                    stats.kills += demonsKilled;
                } else {
                    sim.threat -= demons;
                    if (forgeOperating) {
                        forgeSouls += demons;
                    }
                    stats.kills += demons;
                }
            } else {
                /* Normal encounter */
                let kills = patrolRating;
                if (kills < demons) {
                    /* Suffer casualties if the patrol didn't kill all of the demons */
                    soldiersKilled += PatrolCasualties(params, sim, stats, (demons - kills), false);
                } else {
                    kills = demons;
                }
                sim.threat -= kills;
                if (forgeOperating) {
                    forgeSouls += kills;
                }
                stats.patrolKills += kills;
                stats.kills += kills;
                
                /* Chance to find a soul gem */
                if (kills > 0) {
                    let chances = Math.round(kills / Math.max(5, 35 - Math.floor(params.beacons / 3)));
                    for (let j = 0; j < chances; j++) {
                        if (Rand(0, gemOdds) == 0) {
                            stats.patrolGems++;
                            stats.totalPityPerGem += sim.pity;
                            sim.pity = 0;
                            needPity = false;
                        }
                    }
                }
            }
        } else {
            /* Skipped encounter */
            stats.skippedEncounters++;
        }
    }
    
    if (params.revive) {
        let reviveDivisor = TraitSelect(params.revive, 4, 4, 4, 3, 2, 2, 2);
        let reviveMax = soldiersKilled / reviveDivisor + 0.25;
        /* Yes, the argument is not an integer. This is wacky in-game due to refactoring.
        It's a pretty devastating nerf in practice. See:
        https://github.com/pmotschmann/Evolve/issues/1479 */
        let revived = Rand(0, reviveMax);
        sim.soldiers += revived;
        stats.soldiersRevived += revived;
    }

    if (sim.wounded > sim.soldiers) {
        sim.wounded = sim.soldiers;
    }
    
    if (sim.soldiers < sim.hellSoldiers) {
        sim.hellSoldiers = sim.soldiers;
    }
    
    /* If all reserves are gone, reduce the number of patrols.  This is permanent. */
    if (sim.hellSoldiers < sim.patrols * params.patrolSize) {
        sim.patrols = Math.floor(sim.hellSoldiers / params.patrolSize);
        if (params.printLostPatrols) {
            LogResult(stats, TimeStr(sim) + " - Lost patrol. " + sim.patrols + " remaining.  Threat: " + sim.threat + "\n");
        }
        if (sim.patrols == 0) {
            LogResult(stats, "!!! Lost all patrols at " + TimeStr(sim) + " !!!\n\n");
        }
    }
    
    stats.totalPostFightThreat += sim.threat;
    if (sim.threat < stats.minPostFightThreat) {
        stats.minPostFightThreat = sim.threat;
    }
    if (sim.threat > stats.maxPostFightThreat) {
        stats.maxPostFightThreat = sim.threat;
    }

    LogVerbose(sim, params,
        " ; postThreat " + sim.threat +
        " ; dead " + soldiersKilled +
        " ; gemOdds " + gemOdds +
        "\n");
    
    /* Siege */
    if (params.sieges) {
        sim.siegeOdds--;
        if (sim.siegeOdds <= 900 && Rand(0, sim.siegeOdds) == 0) {
            stats.sieges++;
            let demons = Math.round(sim.threat / 2);
            let defense = FortressRating(params, sim);
     
            if (params.printSieges) {
                LogResult(stats, TimeStr(sim) + " - " +
                    "Siege -- Demons " + demons +
                    ",  Fortress rating " + defense);
            }

            defense = Math.max(1, defense / 35);

            let totalKills = 0;
            while (demons > 0 && sim.walls > 0) {
                let kills = Math.round(Rand(1, defense+1));
                totalKills += Math.min(kills, demons);
                demons -= Math.min(kills, demons);
                sim.threat -= Math.min(kills, sim.threat);
                if (demons > 0) {
                    sim.walls--;
                    if (sim.walls == 0) {
                        break;
                    }
                }
            }
            if (forgeOperating) {
                forgeSouls += totalKills;
            }
            stats.kills += totalKills;
            if (params.printSieges) {
                LogResult(stats, ",  Walls " + sim.walls + "\n");
            }
            
            if (sim.walls == 0) {
                sim.soldiers -= sim.patrols * params.patrolSize;
                sim.soldiers -= sim.hellSoldiers;
                sim.patrols = 0;
                sim.hellSoldiers = 0;
                sim.maxHellSoldiers = 0;
                LogResult(stats, "!!! Walls fell at " + TimeStr(sim) + " !!!\n\n");
            }
            
            sim.siegeOdds = 999;
        }
    }
    
    stats.totalWalls += sim.walls;
    stats.minWalls = Math.min(stats.minWalls, sim.walls);
    
    /* Demon influx */
    if (sim.threat < 10000) {
        let influx = ((10000 - sim.threat) / 2500) + 1;
        influx *= 1 + (params.beacons * 0.22);
        if (params.chicken) {
            influx *= TraitSelect(params.chicken, 2.1, 2, 1.75, 1.5, 1.4, 1.3, 1.2);
        }
        if (params.universe == "evil") {
            influx *= 1.1;
        }
        influx = Math.round(influx);
        sim.threat += Rand(influx * 10, influx * 50);
    }
    

    /* Surveyors */
    if (sim.surveyors > 0) {
        let divisor = 1000;
        if (params.governor == "sports") {
            divisor *= params.bureaucratic_efficiency ? 1.20 : 1.10;
        }
        if (params.blurry) {
            divisor *= TraitSelect(params.blurry, 1.05, 1.10, 1.15, 1.25, 1.35, 1.4, 1.45);
        }
        if (params.yeti_thralls) {
            divisor *= 1 + 0.25 * Fathom(params, params.yeti_thralls);
        }
        if (params.instincts) {
            divisor *= TraitSelect(params.instincts, 1.02, 1.03, 1.05, 1.10, 1.15, 1.2, 1.25);
        }
        if (params.shieldGen) {
            divisor += 250;
        }
        let popfactor = PopFactor(params);
        let danger = popfactor * (sim.threat / divisor);
        let max_risk = popfactor * 10;
        let exposure = Math.min(max_risk, sim.surveyors);
        let risk = max_risk - Rand(0, exposure+1);
        
        if (danger > risk) {
            let cap = Math.round(danger);
            let dead = Rand(0, cap+1);
            sim.surveyors -= Math.min(dead, sim.surveyors);
        }
    }
    
    if (sim.surveyors > 0 && droneKills > 0) {
        for (let i = 0; i < sim.surveyors; i++) {
            let searched = Math.min(100, Rand(Math.round(droneKills / sim.surveyors / 2), Math.round(droneKills / sim.surveyors)));
            let chances = Math.round(searched / Math.max(5, 25 - Math.floor(params.beacons / 5)));
            for (let j = 0; j < chances; j++) {
                if (Rand(0, gemOdds) == 0) {
                    stats.surveyorGems++;
                    stats.totalPityPerGem += sim.pity;
                    sim.pity = 0;
                    needPity = false;
                }
            }
        }
    }

    /* Pity */
    if (needPity && sim.pity < 10000) {
        sim.pity++;
    }

    /* Soul Attractors */
    if (forgeOperating && params.soulAttractors) {
        let bonus = params.soulTrap * 5;
        if (params.soul_bait) {
            bonus *= 2;
        }
        forgeSouls += params.soulAttractors * (bonus + Rand(40, 120));
    }

    /* Ghost Trappers */
    if (forgeOperating && params.ghost_trappers) {
        let souls = params.ghost_trappers * (params.soulTrap * 5 + Rand(150, 250));
        if (params.dimensional_tap) {
            let heatsink = 100;
            if (params.technophobe >= 2) {
                heatsink += params.technophobe >= 4 ? 25 : 10;
                heatsink += 5 * params.additional_technophobe_universes;
            }
            heatsink = Math.max(0, heatsink * params.thermal_collectors - (params.emfield ? 15000 : 10000));
            souls *= 1 + heatsink / 12500;
        }
        let resist = 1;
        if (params.asphodel_hostility) {
            if (params.asphodel_mech_security) {
                resist = 0.34 + params.mech_station_effect * 0.0066;
            } else {
                resist = 0.67;
            }
        }
        forgeSouls += Math.floor(souls * resist);
    }

    /* Gun Emplacements */
    if (forgeOperating && params.guns) {
        let gemOdds = params.technophobe >= 5 ? 6750 : 7500;
        if (params.soulLink) {
            gemOdds = Math.round(gemOdds * 0.94 ** params.soulAttractors);
        }
        let gunKills = 0;
        if (params.advGuns) {
            gunKills = params.guns * Rand(35, 75);
        } else {
            gunKills = params.guns * Rand(20, 40);
        }
        forgeSouls += gunKills;
        stats.kills += gunKills;
        for (let i = 0; i < params.guns; i++) {
            if (Rand(0, gemOdds) == 0) {
                stats.gunGems++;
            }
        }
    }

    /* Gate Turrets */
    if (forgeOperating && params.gateTurrets) {
        let gemOdds = params.technophobe >= 5 ? 2700 : 3000;
        let gateKills = 0;
        if (params.advGuns) {
            gateKills = params.gateTurrets * Rand(65, 100);
        } else {
            gateKills = params.gateTurrets * Rand(40, 60);
        }
        forgeSouls += gateKills;
        stats.kills += gateKills;
        for (let i = 0; i < params.gateTurrets; i++) {
            if (Rand(0, gemOdds) == 0) {
                stats.gateGems++;
            }
        }
    }
    
    /* Soul Forge */
    if (forgeOperating) {
        let gemOdds = params.technophobe >= 5 ? 4500 : 5000;
        let forgeKills = Rand(25, 150);
        forgeSouls += forgeKills;
        stats.kills += forgeKills;
        if (Rand(0, gemOdds) == 0) {
            stats.forgeGems++;
        }
    
        stats.forgeSouls += forgeSouls;
        sim.forgeSouls += forgeSouls;
        
        let cap = params.soulAbsorption ? 750000 : 1000000;
        if (params.soulLink) {
            let base = 0.97;
            if (params.what_is_best >= 3) {
                base = 0.96;
            }
            cap = Math.round(cap * base ** params.soulAttractors);
        }
        if (sim.forgeSouls >= cap) {
            let gems = Math.floor(sim.forgeSouls / cap);
            sim.forgeSouls -= cap * gems;
            stats.forgeGems += gems;
        }
    }
}

function Events(params, sim, stats) {    
    if (Rand(0, sim.eventOdds) == 0) {
        let events = [
            "inspiration",
            "motivation",
            "surge",
            "terrorist"
        ];
        
        if (!(params.kindling || params.smoldering || params.evil || params.aquatic)) {
            events.push("fire");
        }
        if (params.flare) {
            events.push("flare");
        }
        /* TODO: Witch crusade? */
        if (params.ancient_ruins) {
            events.push("ruins");
        }
        if (params.slaver) {
            events.push("slave1", "slave2", "slave3");
        }
        if (params.government == "republic") {
            events.push("protest");
        }
        if (params.governor == "media") {
            events.push("scandal");
        }
        /* TODO: maybe?
        if (params.miners) {
            events.push("mine_collapse");
        }
        */
        if (params.rogue) {
            events.push("klepto");
        }
        if (params.chicken) {
            events.push("chicken_feast");
        }
        if (params.aggressive) {
            events.push("brawl");
        }
        if (params.curious) {
            events.push("m_curious");
        }
        
        /* Remove the last event that occurred from the list so that the same event can't happen twice in a row */
        let lastIdx = events.indexOf(sim.lastEvent);
        if (lastIdx != -1) {
            events.splice(lastIdx, 1);
        }

        let event = events[Rand(0, events.length)];
        
        if (event == "surge") {
            /* Demon surge event, if enabled by user */
            if (params.surges) {
                let surge = Rand(2500, 5000);
                sim.threat += surge;
                stats.surges++;
                if (params.printSurges) {
                    LogResult(stats, TimeStr(sim) + " - Demon Surge Event!  " + surge + " new demons, new threat total " + sim.threat + "\n");
                }
            }
        } else if (event == "terrorist") {
            /* Terrorist attack or enemy raid.  Equivalent for our purposes here */
            if (params.terrorists) {
                let killed = Rand(0, sim.wounded);
                let wounded = Rand(0, sim.soldiers - sim.wounded);
                
                if (params.instincts) {
                    killed = Math.round(killed / 2);
                    wounded = Math.round(wounded / 2);
                }
                
                sim.soldiers -= killed;
                stats.soldiersKilled += killed;
                sim.wounded += wounded;
                
                if (sim.wounded > sim.soldiers) {
                    sim.wounded = sim.soldiers;
                }
                if (params.printTerrorists) {
                    LogResult(stats, TimeStr(sim) + " - Terrorist attack: " + wounded + " wounded, " + killed + " killed.\n");
                }
            }
        } else if (event == "m_curious") {
            if (Rand(0, 25) == 0) {
                stats.curiousGems++;
            }
        } /* else, irrelevant event */
        
        sim.lastEvent = event;
        
        /* Reset event odds */
        sim.eventOdds = 999;
        if (params.astrology == "pisces") {
            sim.eventOdds -= Math.round((params.astroWish ? 79 : 49) * AstroMod(params));
        }
    } else {
        /* No event, increase the odds */
        sim.eventOdds--;
    }
}

function TrainSoldiers(params, sim, stats) {
    if (sim.soldiers >= sim.maxSoldiers) {
        return;
    }
    
    sim.trainingProgress += sim.trainingRate;
    
    if (sim.trainingProgress >= 100) {
        let trained = Math.floor(sim.trainingProgress / 100);
        sim.soldiers += trained;
        stats.soldiersTrained += trained;
        sim.trainingProgress -= trained * 100;
        sim.hellSoldiers = Math.min(sim.hellSoldiers + trained, sim.maxHellSoldiers);
    }
}

function HireMercs(params, sim, stats) {
    var result;
    do {
        result = TryBuyMerc(params, sim, stats);
    } while (result == true);
    
    if (sim.money < stats.minMoney) {
        stats.minMoney = sim.money;
    }
    return;
}

function TryBuyMerc(params, sim, stats) {
    
    /* Filter out no-buy cases in stages to avoid calculating merc price every time */
    
    switch (params.hireMercs) {
        case "off":
            return false;
        case "governor": /* Governor task: Merc Recruitment */
        case "script": /* Volch Script */
            if (sim.soldiers + params.mercBuffer >= sim.maxSoldiers) {
                return false;
            }
            /* else proceed */
            break;
        case "autoclick": /* Autoclick */
            sim.clickerCounter++;
            if ((sim.clickerCounter * sim.tickLength) / 1000 < params.clickerInterval) {
                return false;
            } else {
                sim.clickerCounter = 0;
                if (sim.soldiers >= sim.maxSoldiers) {
                    return false;
                }
            }
            break;
        default: return false;
    }
    
    var price = MercPrice(params, sim, stats);
    if (price > sim.money) {
        return false;
    }
    
    switch (params.hireMercs) {
        case "governor":
            let reserve = params.moneyCap * (params.mercReserve / 100);
            if (sim.money + params.moneyIncome < reserve && price > params.moneyIncome)
            {
                return false;
            }
            break;
        case "script":
            var moneyThreshold = params.moneyCap * (params.scriptCapThreshold / 100.0);
            var incomeThreshold = params.moneyIncome * params.scriptIncome;
            
            if (sim.money > moneyThreshold || price <= incomeThreshold) {
                break;
            } else {
                return false;
            }
        default:
            return false;
    }
    
    /* Passed all checks.  Hire a merc */
    sim.money -= price;
    sim.soldiers++;
    if (sim.hellSoldiers < sim.maxHellSoldiers) {
        sim.hellSoldiers++;
    }
    stats.mercCosts += price;
    sim.mercCounter++;
    stats.mercsHired++;

    if (price > stats.maxMercPrice) {
        stats.maxMercPrice = price;
    }
    
    return true;
}
    
function MercPrice(params, sim, stats) {
    var garrison = sim.soldiers - sim.hellSoldiers;
    var price = Math.round((1.24 ** garrison) * 75) - 50;
    if (price > 25000){
        price = 25000;
    }
    if (sim.mercCounter > 0) {
        price *= 1.1 ** sim.mercCounter;
    }
    if (params.brute) {
        price *= TraitSelect(params.brute, 0.85, 0.8, 0.75, 0.5, 0.4, 0.35, 0.3);
    }
    if (params.orc_thralls) {
        price *= 0.5 * Fathom(params, params.orc_thralls);
    }
    if (params.highPop) {
        price *= TraitSelect(params.highPop, 0.5, 0.5, 0.34, 0.26, 0.212, 0.18, 0.158);
    }
    
    /* Convert to millions */
    price /= 1000000.0;
    
    return price;
}

function HealSoldiers(params, sim, stats) {
    if (sim.wounded <= 0) {
        return;
    }

    var healed = 1;
    
    if (params.regenerative) {
        healed = TraitSelect(params.regenerative, 1, 2, 3, 4, 5, 6, 7);
    }
    
    var healCredits = params.hospitals;
    if (params.artifical) {
        healCredits = params.bootCamps;
    }
    if (params.rejuvenated && params.lamentis) {
        healCredits += params.lamentis;
    }
    if (params.astrology == "cancer") {
        healCredits = Math.max(0, healCredits + Math.round((params.astroWish ? 8 : 5) * AstroMod(params)));
    }
    if (params.bacTanks) {
        healCredits *= 2;
    }
    healCredits += params.fibroblast * 2;
    if (params.cannibal) {
        if (healCredits >= 20) {
            healCredits *= TraitSelect(params.cannibal, 1.06, 1.08, 1.1, 1.15, 1.2, 1.22, 1.24);
        } else {
            healCredits += Math.floor(TraitSelect(params.cannibal, 1.2, 1.6, 2, 3, 4, 4.4, 4.8));
        }
        healCredits += 3;
    }
    if (params.mantis_thralls) {
        if (healCredits >= 20) {
            healCredits *= 1 + 0.15 * Fathom(params, params.mantis_thralls);
        } else {
            healCredits += Math.floor(3 * Fathom(params, params.mantis_thralls));
        }
    }
    if (params.highPop) {
        healCredits *= TraitSelect(params.HighPop, 1.2, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5);
    }
    if (params.governor == "sports") {
        healCredits *= 1.5;
    }
    if (params.troll_thralls) {
        healCredits += Math.round(20 * 4 * Fathom(params, params.troll_thralls));
    }
    healCredits = Math.round(healCredits);
    
    var healCost = 20;
    if (params.slowRegen) {
        healCost *= TraitSelect(params.slowRegen, 1.45, 1.4, 1.35, 1.25, 1.2, 1.15, 1.12);
    }
    healed += Math.floor(healCredits / healCost);
    healCredits = healCredits % healCost;
    if (Rand(0, healCost) < healCredits) {
        healed++;
    }
    
    sim.wounded -= healed;
    if (sim.wounded < 0) {
        sim.wounded = 0;
    }
}

function RepairSurveyors(params, sim, stats) {
    if (sim.surveyors >= params.surveyors) {
        return;
    }
    let repair = 180;
    if (params.repairDroids > 0) {
        repair *= 0.95 ** params.repairDroids;
    }
    if (params.highPop) {
        repair /= TraitSelect(params.HighPop, 1.2, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5);
    }
    repair = Math.round(repair);
    
    sim.carRepair++;
    if (sim.carRepair >= repair) {
        sim.carRepair = 0;
        sim.surveyors++;
    }
}

function Vacuum(params, sim, stats) {
    if (params.soul_compactor && params.vacuums > 0) {
        let drain = 1653439 * params.vacuums;
        if (params.suction_force && params.batteries > 0) {
            drain *= 1 + params.batteries * 0.08;
        }
        sim.compactor_energy += Math.round(drain / 2);
        if (sim.compactor_energy >= 1000000000) {
            sim.compactor_energy -= 1000000000;
            stats.compactorGems++;
        }
    }
}

function PatrolCasualties(params, sim, stats, demons, ambush) {
    var armor;
    if (ambush) {
        /* Armor is ineffective in an ambush, and demons are stronger */
        armor = 0;
        demons = Math.round(demons * (1 + Math.random() * 3));
    } else {
        armor = params.armorTech;
        if (params.apexPredator) {
            armor = 0;
        }
        if (params.armored) {
            armor += TraitSelect(params.armored, 0, 1, 1, 2, 2, 2, 2);
        }
        if (params.tortosian_thralls) {
            armor += Math.floor(2 * Fathom(params, params.tortosian_thralls));
        }
        if (params.scales) {
            armor += TraitSelect(params.scales, 0, 1, 1, 1, 1, 2, 2);
        }
    }
    
    let casualties = Math.round(Math.log2((demons / params.patrolSize) / (armor || 1))) - Rand(0, armor);
    let dead = 0;
    
    if (casualties > 0) {
        if (casualties > params.patrolSize) {
            casualties = params.patrolSize;
        }
        casualties = Rand((ambush ? 1 : 0), (casualties + 1));
        dead = Rand(0, (casualties + 1));
        let wounded = casualties - dead;
        if (params.instincts) {
            let proportion = TraitSelect(params.instincts, 0.1, 0.15, 0.25, 0.5, 0.6, 0.65, 0.7);
            let reduction = Math.floor(dead * proportion);
            dead -= reduction;
            wounded += reduction;
        }
        sim.wounded += wounded;
        sim.soldiers -= dead;
        stats.soldiersKilled += dead;
        if (ambush) {
            stats.ambushDeaths += dead;
        }
    }
    
    return dead;
}

function TickLength(params) {
    let tickLength = 250;
    if (params.hyper) {
        tickLength *= TraitSelect(params.hyper, 0.99, 0.98, 0.97, 0.95, 0.94, 0.93, 0.92);
    }
    if (params.slow) {
        tickLength *= TraitSelect(params.slow, 1.14, 1.13, 1.12, 1.1, 1.08, 1.06, 1.05);
    }
    return tickLength;
}

/* Returns soldier training rate in progress points (%) per tick */
function TrainingRate(params) {
    var bootCampBonus;

    bootCampBonus = params.vrTraining == true ? 0.08 : 0.05;
    bootCampBonus += params.bloodLust * 0.002;
    if (params.governor == "soldier") {
        bootCampBonus *= params.bureaucratic_efficiency ? 1.3 : 1.25;
    }
    
    /* Rate is calculated in percentage points per second */
    let rate = 2.5;
    if (params.highPop) {
        rate *= TraitSelect(params.highPop, 1.2, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5);
    }
    if (params.diverse) {
        rate /= TraitSelect(params.diverse, 1.4, 1.35, 1.3, 1.25, 1.2, 1.15, 1.12);
    }
    if (params.bootCamps) {
        rate *= 1 + params.bootCamps * TrainingBonus(params.vrTraining ? 0.08 : 0.05, params);
    }
    if (params.bunkers && params.spectral_training) {
        rate *= 1 + params.bunkers * TrainingBonus(0.1, params);
    }
    if (params.beast) {
        rate *= TraitSelect(params.beast, 1.03, 1.04, 1.05, 1.1, 1.15, 1.2, 1.25);
    }
    if (params.brute) {
        rate += TraitSelect(params.brute, 1, 1.25, 1.5, 2.5, 3, 3.5, 3.75);
    }
    if (params.orc_thralls) {
        rate += 2.5 * Fathom(params, params.orc_thralls);
    }
    /* Convert to progress per tick (as does the game) */
    rate *= 0.25;
    
    return rate;
}

function TrainingBonus(value, params) {
    value += params.bloodLust * 0.002;
    if (params.governor == "soldier") {
        value *= params.bureaucratic_efficiency ? 1.3 : 1.25;
    }
    return value;
}

function ArmyRating(params, sim, size, wound) {
    var rating = size;
    var wounded = 0;
    
    if (wound != undefined) {
        wounded = wound;
    } else if (sim) {
        if (size > sim.soldiers - sim.wounded) {
            wounded = size - (sim.soldiers - sim.wounded);
        }
    }
    
    if (params.rhinoRage || (params.unfathomable && params.rhinotaur_thralls)) {
        if (params.rhinoRage) {
            rating += wounded * TraitSelect(params.rhinoRage, 0.1, 0.2, 0.3, 0.5, 0.6, 0.65, 0.7);
        }
        if (params.rhinotaur_thralls) {
            rating += wounded * (0.5 * Fathom(params, params.rhinotaur_thralls));
        }
    } else {
        rating -= wounded / 2;
    }

    /* Game code subtracts 1 for tech >= 5 to skip bunk beds.  Here that gets skipped in the HTML selection values themselves */
    let weaponTech = params.weaponTech;

    if (weaponTech > 1) {
        /* Sniper bonus doesn't apply to the base value of 1 or the Cyborg Soldiers upgrade */
        weaponTech -= params.weaponTech >= 10 ? 2 : 1;
        if (params.sniper) {
            weaponTech *= 1 + weaponTech * TraitSelect(params.sniper, 0.03, 0.04, 0.06, 0.08, 0.09, 0.1, 0.11);
        }
        if (params.centaur_thralls) {
            weaponTech *= 1 + weaponTech * 0.08 * Fathom(params, params.centaur_thralls);
        }
        weaponTech += params.weaponTech >= 10 ? 2 : 1;
    }

    rating *= weaponTech;

    rating *= 1 + (params.tactical * 0.05);
    if (params.zealotry) {
        rating *= 1 + (params.temples * 0.01);
    }
    if (sim && params.rhinoRage) {
        let rageBonus = TraitSelect(params.rhinoRage, 0.002, 0.0025, 0.005, 0.01, 0.0125, 0.014, 0.015);
        rating *= 1 + (rageBonus * sim.wounded);
    }
    if (sim && params.rhinotaur_thralls) {
        rating *= 1 + 0.01 * Fathom(params, params.rhinotaur_thralls) * sim.wounded;
    }
    if (params.puny) {
        rating *= TraitSelect(params.puny, 0.8, 0.82, 0.85, 0.9, 0.94, 0.96, 0.97);
    }
    if (params.claws) {
        rating *= TraitSelect(params.claws, 1.05, 1.08, 1.12, 1.25, 1.32, 1.35, 1.38);
    }
    if (params.scorpid_thralls) {
        rating *= 1 + 0.25 * Fathom(params, params.scorpid_thralls);
    }
    if (params.chameleon) {
        rating *= TraitSelect(params.chameleon, 1.03, 1.05, 1.1, 1.2, 1.25, 1.3, 1.35);
    }
    if (params.cautious && sim && sim.weather == 0) {
        /* Note: old simplified weather was Rand(0, 1000) < 216 */
        rating *= TraitSelect(params.cautious, 0.84, 0.86, 0.88, 0.9, 0.92, 0.94, 0.96);
    }

    if (params.apexPredator) {
        rating *= TraitSelect(params.apexPredator, 1.1, 1.15, 1.2, 1.3, 1.4, 1.45, 1.5);
    }
    if (params.sharkin_thralls) {
        rating *= 1 + 0.3 * Fathom(params, params.sharkin_thralls);
    }
    if (params.swift) {
        rating *= TraitSelect(params.swift, 1.2, 1.35, 1.55, 1.75, 1.85, 1.9, 1.92);
    }
    if (params.fiery) {
        rating *= TraitSelect(params.fiery, 1.2, 1.3, 1.4, 1.65, 1.7, 1.72, 1.74);
    }
    if (params.balorg_thralls) {
        rating *= 1 + 0.65 * Fathom(params, params.balorg_thralls);
    }
    if (params.sticky) {
        rating *= TraitSelect(params.sticky, 1.03, 1.05, 1.08, 1.15, 1.18, 1.2, 1.22);
    }
    if (params.pinguicula_thralls) {
        rating *= 1 + 0.15 * Fathom(params, params.pinguicula_thralls);
    }
    if (params.pathetic) {
        rating *= TraitSelect(params.pathetic, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.88);
    }
    if (params.holy) {
        rating *= TraitSelect(params.holy, 1.2, 1.25, 1.3, 1.5, 1.6, 1.65, 1.7);
    }
    if (params.unicorn_thralls) {
        rating *= 1 + 0.5 * Fathom(params, params.unicorn_thralls);
    }
    if (params.banana) {
        rating *= 0.8;
    }
    if (params.astrology == "aries") {
        rating *= 1 + Math.round((params.astroWish ? 12 : 10) * AstroMod(params)) / 100;
    }
    if (params.governor == "soldier") {
        rating *= params.bureaucratic_efficiency ? 1.3 : 1.25;
    }
    if (params.rage) {
        rating *= 1.05;
    }
    if (params.elemental) {
        rating *= TraitSelect(params.elemental, 1.01, 1.02, 1.04, 1.06, 1.08, 1.1, 1.2);
    }
    if (params.ocularPower && params.ocular_disintegration) {
        rating *= TraitSelect(params.ocularPower, 1.05, 1.125, 1.25, 1.375, 1.5, 1.625, 1.75);
    }
    if (params.psychic) {
        let boost = 0;
        if (params.channel_assault) {
            boost += +(TraitSelect(params.psychic, 15, 20, 30, 40, 50, 60, 65) / 50000 * params.nightmare * params.channel_assault).toFixed(3);
        }
        rating *= 1 + boost;
    }
    if (params.tusk) {
        let moisture = 0;
        switch (params.biome) {
            case 'oceanic':
            case 'swamp':
                moisture = 30;
                break;
            case 'eden':
            case 'forest':
            case 'grassland':
            case 'savanna':
                moisture = 20;
                break;
            case 'tundra':
            case 'taiga':
                moisture = 10;
                break;
            default:
                break;
        }
        if (sim && sim.weather == 0 && sim.temp > 0) {
            moisture += 10;
        }
        rating *= 1 + Math.round(moisture * TraitSelect(params.tusk, 0.4, 0.5, 0.75, 1, 1.2, 1.4, 1.6)) / 100 / 2;
    }
    if (params.grenadier) {
        rating *= TraitSelect(params.grenadier, 2, 2.1, 2.25, 2.5, 2.75, 3, 3.25);
    }
    if (params.rejuvenated) {
        rating *= 1.05;
    }
    if (params.government == "autocracy") {
        let bonus = (params.governor == "bureaucrat") ? 40 : 35;
        if (params.bureaucratic_efficiency) {
            bonus += (params.governor == "bureaucrat") ? 10 : 5;
        }
        rating *= 1 + bonus / 100;
    }
    if (params.universe == "evil") {
        if (params.authority > 100) {
            let dark = params.dark_energy;
            if (params.harmony > 0) {
                dark *= 1 + params.harmony * 0.01;
            }
            if (params.evil_lemon) {
                dark *= 1 + params.evil_lemon * 0.03;
            }
            let boost = (params.authority - 100) / params.authority * 0.75;
            boost *= 1 + ((Math.log2(10 + dark) - 3.321928094887362) / 10);
            rating *= 1 + boost;
        } else {
            rating *= params.authority / 100;
        }
    }

    rating = Math.floor(rating);

    let racialModifier = 1;
    if (params.hivemind) {
        let breakpoint = TraitSelect(params.hivemind, 13, 12, 11, 10, 8, 7, 6);
        if (size <= breakpoint) {
            racialModifier *= (size * 0.05) + (1 - breakpoint * 0.05);
        } else {
            racialModifier *= 1 + (1 - (0.99 ** (size - breakpoint)));
        }
    }
    if (params.antid_thralls) {
        racialModifier *= 1 + (1 - (0.99 ** (size * Fathom(params, params.antid_thralls) / 4))) / 2;
    }
    if (params.cannibal) {
        racialModifier *= TraitSelect(params.cannibal, 1.06, 1.08, 1.1, 1.15, 1.2, 1.22, 1.24);
    }
    if (params.mantis_thralls) {
        racialModifier *= 1 + 0.15 * Fathom(params, params.mantis_thralls);
    }
    if (params.ooze) {
        racialModifier *= TraitSelect(params.ooze, 0.75, 0.8, 0.85, 0.88, 0.9, 0.92, 0.94);
    }
    if (params.government == "democracy") {
        let malus = (params.governor == "bureaucrat") ? 1 : 5;
        racialModifier *= 1 - malus / 100;
    }
    if (params.universe == "magic") {
        racialModifier *= 0.75;
        if (params.witch_hunter) {
            racialModifier *= 0.75;
        }
        if (params.warRitual) {
            let boost = params.warRitual / (params.warRitual + 75);
            if (params.witch_hunter) {
                boost *= 2.5;
            }
            racialModifier *= 1 + boost;
        }
    }
    if (params.highPop) {
        racialModifier *= TraitSelect(params.highPop, 0.5, 0.5, 0.34, 0.26, 0.212, 0.18, 0.158);
    }
    rating *= racialModifier;

    if (params.parasite) {
        if (size == 1) {
            rating += 2;
        } else if (size > 1) {
            rating += 4;
        }
    }

    if (rating <= 0 && size > 0) {
        rating = 0.01;
    }

    return rating;
}

function DroidSize(params) {
    return PopFactor(params) * (params.enhDroids ? 2 : 1);
}

function FortressRating(params, sim) {
    var turretRating;
    var patrols;
    var defenders;
    var wounded;
    
    if (sim) {
        patrols = sim.patrols;
        defenders = sim.hellSoldiers - (sim.patrols * params.patrolSize);
        if (params.soulForge >= 1) {
            let forgeSoldiers = ForgeSoldiers(params);
            if (defenders >= forgeSoldiers) {
                defenders -= forgeSoldiers;
            }
        }
        let garrison = sim.soldiers - sim.hellSoldiers;
        if (sim.wounded > garrison) {
            wounded = sim.wounded - garrison;
            if (wounded > defenders) {
                wounded = defenders;
            }
        } else {
            wounded = 0;
        }
    } else {
        patrols = params.patrols;
        defenders = params.defenders;
        wounded = 0;
    }
    
    if (params.droids > patrols) {
        defenders += (params.droids - patrols) * DroidSize(params);
    }
    
    switch (params.turretTech) {
        case 0:
            turretRating = 35;
            break;
        case 1:
            turretRating = 50;
            break;
        case 2:
        default:
            turretRating = 70;
            break;
    }
    
    return ArmyRating(params, sim, defenders, wounded) + params.turrets * turretRating;
}

function ForgeSoldiers(params) {
    let popfactor = PopFactor(params);
    let rating = Math.max(ArmyRating(params, false, 1), popfactor);
    let soldiers = Math.ceil(650 / rating);
    
    let gunSavings = params.guns * popfactor * (params.advGuns ? 2 : 1);
    soldiers = Math.max(0, soldiers - gunSavings);
    
    if (params.hivemind && soldiers > 0) {
        soldiers = 1;
        while ((soldiers + gunSavings) * rating < 650) {
            soldiers++;
            rating = Math.max(ArmyRating(params, false, soldiers), popfactor) / soldiers;
        }
    }
    
    return soldiers;
}

function TraitSelect(trait_rank, rank_tenth, rank_quarter, rank_half, rank_1, rank_2, rank_3, rank_4) {
    switch (trait_rank || 1) {
        case 0.1:
            return rank_tenth;
        case 0.25:
            return rank_quarter;
        case 0.5:
            return rank_half;
        case 1:
        default:
            return rank_1;
        case 2:
            return rank_2;
        case 3:
            return rank_3;
        case 4:
            return rank_4;
    }
}

function AstroMod(params) {
    let mod = 1;
    if (params.astrologer) {
        let bonus = TraitSelect(params.astrologer, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7);
        if (params.unfavored) {
            mod -= bonus;
        } else {
            mod += bonus;
        }
    }
    if (params.unfavored) {
        mod *= TraitSelect(params.unfavored, -1.75, -1.5, -1.25, -1, -0.75, -0.5, -0.25);
    }
    return mod;
}

function Fathom(params, thralls) {
    let active = Math.min(100, thralls);
    if (params.torturers && active > params.torturers) {
        active -= Math.ceil((active - params.torturers) / 3);
    }
    return (active / 100) * (params.nightmare / 5);
}

function PopFactor(params) {
    if (params.highPop) {
        return TraitSelect(params.highPop, 2, 2, 3, 4, 5, 6, 7);
    } else {
        return 1;
    }
}

function UpdateWeather(sim, params, stats) {
    sim.day++;
    if (sim.day >= params.orbit) {
        sim.day = 0;
    }
    
    /* TODO: cata / decay */
    
    if (Rand(0, 5) == 0) {
    
        let season = 0;
        if (params.elliptical) {
            season = Math.floor(sim.day / Math.round(params.orbit / 6));
            season = Math.min(3, Math.round(season * 4/6));
        } else {
            /* Yes, season 4 is a thing in the real game too... */
            season = Math.floor(sim.day / Math.round(params.orbit / 4));
        }
        
        let temp = Rand(0, 3);
        let sky = Rand(0, 5);
        /* Wind doesn't need to be simmed at the moment */
        /* let wind = Rand(0, 3); */
        
        switch (params.biome) {
            case 'oceanic':
            case 'swamp':
                if (sky > 0 && Rand(0, 3) == 0) {
                    sky--;
                }
                break;
            case 'tundra':
            case 'taiga':
                if (season == 3) {
                    temp = 0;
                } else if (temp > 0 && Rand(0, 2) == 0) {
                    temp--;
                }
                break;
            case 'desert':
                if (sky < 4 && Rand(0, 2) == 0) {
                    sky++;
                }
                break;
            case 'ashland':
                if (Rand(0, 2) == 0) {
                    if (sky < 1) {
                        sky++;
                    } else if (sky > 2) {
                        sky--;
                    }
                }
                /* Falls through */
            case 'volcanic':
                if (season == 1) {
                    temp = 2;
                } else if (temp < 2 && Rand(0, 2) == 0) {
                    /* Permafrost check -- ashland / volcanic can't be permafrost? */
                    temp++;
                }
                break;
            default:
                break;
        }
        
        switch (season) {
            case 0:
                if (sky > 0 && Rand(0, 3) == 0) {
                    sky--;
                }
                break;
            case 1:
                if (temp < 2 && Rand(0, 3) == 0) {
                    temp++;
                }
                break;
            case 2:
                /* Skip wind
                if (wind > 0 && Rand(0, 3) == 0) {
                    wind--;
                }
                */
                break;
            case 3:
                if (temp > 0 && Rand(0, 3) == 0) {
                    temp--;
                }
                break;
            default:
                break;
        }
        
        /* Skip wind
        if (params.stormy && wind > 0 && Rand(0, 2) == 0) {
            // rejuvenated also affects wind here
            wind--;
        }
        */
        
        if (sky == 0) {
            sim.weather = 0;
        } else if (sky >= 1 && sky <= 2) {
            sim.weather = 1;
        } else {
            sim.weather = 2;
            /* Don't sim darkness, as weather 2 and weather 1 are the same for our purposes...
            
            if (params.darkness) {
                if (Rand(0, 7 - TraitSelect( params.darkness, 0, 1, 2, 3, 4, 5, 6 )) == 0) {
                    sim.weather = 1;
                }
            }
            */
        }
        
        if (temp == 0) {
            let min_temp = 0;
            if (season == 1 || params.biome == 'hellscape' || (params.biome == 'eden' && season != 3)) {
                /* Permafrost check -- hellscape can't be permafrost? */
                min_temp = 1;
            }
            sim.temp = Math.max(min_temp, sim.temp - 1);
        } else if (temp == 2) {
            let max_temp = 2;
            if (season == 3 || (params.biome == 'eden' && season != 1)) {
                max_temp = 1;
            }
            sim.temp = Math.min(max_temp, sim.temp + 1);
        }
    }
    
    if (sim.weather == 0) {
        stats.rainy++;
        if (sim.temp > 0) {
            stats.wet++;
        }
    }
}

function Rand(min, max) {
    return Math.floor(Math.random() * (max - min)) + min;
}

function LogResult(stats, str) {
    stats.outputStr += str;
}

function LogVerbose(stats, params, str) {
    if (!params.verbose) return;
    LogResult(stats, str);
}

function TimeStr(sim) {
    let seconds = Math.round(sim.tick * sim.tickLength / 1000);
    let minutes = Math.floor(seconds / 60);
    seconds = seconds % 60;
    let hours = Math.floor(minutes / 60);
    minutes = minutes % 60;
    
    let str = "";
    
    if (hours < 100) {
        str += "0";
    }
    if (hours < 10) {
        str += "0";
    }
    str += hours.toString() + ":";
    if (minutes < 10) {
        str += "0";
    }
    str += minutes.toString() + ":";
    if (seconds < 10) {
        str += "0";
    }
    str += seconds.toString();
    
    return str;
}



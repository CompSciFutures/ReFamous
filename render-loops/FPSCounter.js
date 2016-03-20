/**
 * The MIT License (MIT)
 *
 * Copyright (c) 2016 Andrew Prendergast.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

"use strict";

var N_BUCKETS = 10, BUCKET_DURATION_IN_MS = 1000; // keep track of last 10 seconds
var PAUSE_BETWEEN_CONSOLE_LOGS_MS = 5000;
var TARGET_FPS = 15;
var SLOW_FPS_THRESHOLD = 0.7; // min proportion of target FPS (eg, 1.0 = current target FPS, 0.5 = 50% of current target FPS)
var EXCESSIVE_CPU_THRESHOLD = 0.1; // max proportion of CPU use (1.0 = 100% of CPU)

/**
 * To get famous to log it's current FPS, MSPF & CPU %, do the following:
 * require("famous").core.FamousEngine.renderLoop._FPSCounter.logFPSToConsole()
 *
 * To speed up / slow down the render loop by changing the target FPS, do the following:
 * require("famous").core.FamousEngine.renderLoop._FPSCounter.setTargetFPS(30.0);
 */
function FPSCounter() {
    this._bins = [];
    for ( var i = 0; i < N_BUCKETS; i++ )
        this._bins[i] = this._resetBin({iBinIndex: i});
    this._ttLastPerformanceCheck = Date.now();
    this._iTickIndex = 0;
    this._ttLastTick = performance.now();
    this._ttTickStarted = null;
    this._iTargetFPS = TARGET_FPS;
}

/**
 * Check FPS throttling
 * @returns {boolean} true is doing a frame tick would not exceed the target FPS
 */
FPSCounter.prototype.isReadyForUpdate = function() {
    var nMSSinceLastTick = performance.now() - this._ttLastTick;
    return !this._ttLastTick || nMSSinceLastTick > 1000 / this._iTargetFPS ? true : false;
};

FPSCounter.prototype.tickStarted = function() {
    this._ttTickStarted = performance.now();
};

FPSCounter.prototype.tickFinished = function() {

    var oCurrentBin = this._getCurrentBin(this._ttTickStarted);

    // update current bin with latest stats
    var ttNow = performance.now();
    var nDuration = ttNow - this._ttTickStarted;
    oCurrentBin.iCycleCount++;
    oCurrentBin.iLatestFrameIndex = this._iTickIndex;
    this._currentbin = oCurrentBin.iBinIndex;
    oCurrentBin.nUpdateMS += nDuration;

    // update post-tick state
    this._ttLastTick = this._ttTickStarted;
    this._iTickIndex++;

    // console output
    this._logFPSToConsoleIfSlow();
};


FPSCounter.prototype.logFPSToConsole = function(sMessage) {
    var oFrameRateStats = this._getFrameRateStats();
    console.warn(
        new Date().toLocaleTimeString(), " ",
        sMessage ? sMessage : "Performance stats report" + ":",
        "FPS=", oFrameRateStats.FPS.toFixed(1),
        "_looper MSPF/CPU=", oFrameRateStats.MSPF.toFixed(2), "ms", "/", ((oFrameRateStats.MSPF * oFrameRateStats.FPS)/1000.0*100.0).toFixed(2), "%"
    );
};

FPSCounter.prototype.setTargetFPS = function(iFPS) {
    this._iTargetFPS = iFPS;
};

FPSCounter.prototype._logFPSToConsoleIfSlow = function() {
    if (Date.now() - this._ttLastPerformanceCheck > PAUSE_BETWEEN_CONSOLE_LOGS_MS) {
        var oFrameRateStats = this._getFrameRateStats();
        var bSlowFrameRate = oFrameRateStats.FPS !== null && oFrameRateStats.FPS < this._iTargetFPS * SLOW_FPS_THRESHOLD;
        var bExcessiveCPU = oFrameRateStats.FPS !== null && oFrameRateStats.MSPF !== null && (oFrameRateStats.MSPF * oFrameRateStats.FPS)/1000.0 > EXCESSIVE_CPU_THRESHOLD;
        if (oFrameRateStats.FPS !== null && (!this._ttLastPerformanceCheck || bSlowFrameRate || bExcessiveCPU)) {
            this.logFPSToConsole(
                bSlowFrameRate ? "Slow frame rate detected" :
                    bExcessiveCPU ? "excessive CPU use" :
                        "unknown cause"
            );
            this._ttLastPerformanceCheck = Date.now();
        }
    }
};

FPSCounter.prototype._getFrameRateStats = function() {
    var oStats = {
        total_frames: 0,
        total_duration_ms: 0,
        n_samples: 0,
        FPS: null,
        MSPF: null
    };

    for (var i = 0; i < this._bins.length; i++ )
        if ( this._bins[i].iStartMS && i !== this._currentbin )
        {
            oStats.total_frames += this._bins[i].iCycleCount;
            oStats.total_duration_ms += this._bins[i].nUpdateMS;
            oStats.n_samples += 1;
        }

    if ( oStats.n_samples ) {
        oStats.FPS = oStats.total_frames / oStats.n_samples;
        oStats.MSPF = oStats.total_duration_ms / oStats.total_frames;
    }

    return oStats;
};


FPSCounter.prototype._getCurrentBin = function(ttNow) {
    var iCurrentStartMS = Math.floor(ttNow / BUCKET_DURATION_IN_MS),
        iCurrentBin = iCurrentStartMS % N_BUCKETS,
        oCurrentBin = this._bins[iCurrentBin];

    // reset previous bins
    /*
     while ( iLastBin !== this._currentbin ) {
     _resetBin(_bins[iLastBin]);
     iLastBin = (iLastBin + 1) % 10;
     }
     */

    // reset current bin
    if ( oCurrentBin.iStartMS !== iCurrentStartMS ) {
        this._resetBin(oCurrentBin);
        oCurrentBin.iStartMS = iCurrentStartMS;
    }

    return oCurrentBin;
};

FPSCounter.prototype._resetBin = function(oBin) {
    oBin.iStartMS = null;
    oBin.iCycleCount = 0;
    oBin.nUpdateMS = 0;
    oBin.iLatestFrameIndex = null;
    return oBin;
};

module.exports = new FPSCounter;

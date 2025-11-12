// --- 0. 权限检查 ---
auto.waitFor(); // 检查无障碍服务
// !!! 请在运行前，手动为 Auto.js 开启“悬浮窗权限” !!!

// --- 1. 全局变量定义 (全部提前) ---
var logHistory = []; 
var MAX_LOG_LINES = 50; 
var startTime = new Date().getTime(); 
var isPaused = true; // <-- 关键：默认设置为“暂停”
var onTimerEndAction = 0; // 0 = 关闭并停止, 1 = 暂停播放并暂停
var douyinPackage = ""; // 目标包名

// --- 2. 辅助函数定义 (全部提前) ---

/**
 * 安全地更新悬浮窗日志（跨线程）
 */
function logToWindow(msg) {
    if (typeof window === 'undefined' || window === null) {
        console.log("日志 (悬浮窗未就绪): " + msg);
        return;
    }
    ui.run(function() {
        var time = new Date().toLocaleTimeString(); 
        var logMsg = time + ": " + msg;
        logHistory.push(logMsg); 
        if (logHistory.length > MAX_LOG_LINES) {
            logHistory.shift(); 
        }
        window.logText.setText(logHistory.join("\n"));
        
        ui.post(function() {
            try {
                var textHeight = window.logText.getHeight();
                window.logScrollView.scrollTo(0, textHeight);
            } catch (e) {
                console.error("滚动失败: " + e);
            }
        }, 200); 
    });
}

/**
 * 格式化毫秒为 HH:MM:SS
 */
function formatMillis(ms) {
    var seconds = Math.floor((ms / 1000) % 60);
    var minutes = Math.floor((ms / (1000 * 60)) % 60);
    var hours = Math.floor(ms / (1000 * 60 * 60)); 
    seconds = (seconds < 10 ? '0' : '') + seconds;
    minutes = (minutes < 10 ? '0' : '') + minutes;
    hours = (hours < 10 ? '0' : '') + hours;
    return hours + ":" + minutes + ":" + seconds;
}


// --- 3. 用户自定义输入 (在悬浮窗创建前完成) ---

// 3a. 选择应用
var appIndex = dialogs.select(
    "请选择要运行的应用",
    "抖音 (普通版)",     // 索引 0
    "抖音极速版"         // 索引 1
);

if (appIndex === -1) { toast("用户取消了操作"); exit(); }
else if (appIndex === 0) { douyinPackage = "com.ss.android.ugc.aweme"; }
else if (appIndex === 1) { douyinPackage = "com.ss.android.ugc.aweme.lite"; }
toastLog("已选择包名: " + douyinPackage);

// 3b. 询问是否双开
var hasClonedApps = dialogs.confirm(
    "重要：您是否对所选应用使用了“双开”或“应用分身”功能？"
);

// 3c. 自定义滑动时间
var minSecInput = dialogs.rawInput("请输入【最小】观看时间（秒）", "5");
if (minSecInput === null) { toast("用户取消了操作"); exit(); }
var minSec = parseInt(minSecInput);
if (isNaN(minSec) || minSec <= 0) { minSec = 5; }

var maxSecInput = dialogs.rawInput("请输入【最大】观看时间（秒）", "15");
if (maxSecInput === null) { toast("用户取消了操作"); exit(); }
var maxSec = parseInt(maxSecInput);
if (isNaN(maxSec) || maxSec <= 0) { maxSec = 15; }

if (minSec > maxSec) {
    var temp = minSec; minSec = maxSec; maxSec = temp;
}
var minDelay = minSec * 1000;
var maxDelay = maxSec * 1000;

// 3d. 设置自动停止时间
var autoStopMinutesInput = dialogs.rawInput("请输入【总运行分钟数】（输入0为不限制）", "0");
var autoStopMinutes = parseInt(autoStopMinutesInput);
if (isNaN(autoStopMinutes) || autoStopMinutes < 0) { autoStopMinutes = 0; }

// 3e. 选择结束时的操作
var autoStopMillis = 0;
if (autoStopMinutes > 0) {
    var actionIndex = dialogs.select(
        "当 " + autoStopMinutes + " 分钟到达后",
        "返回桌面并停止脚本", // 索引 0
        "暂停播放并暂停脚本"  // 索引 1 
    );
    if (actionIndex === -1) { toast("用户取消了操作"); exit(); }
    onTimerEndAction = actionIndex; 
    autoStopMillis = autoStopMinutes * 60 * 1000;
    var actionText = (onTimerEndAction === 0) ? "返回桌面并停止" : "暂停播放并暂停脚本"; 
    toastLog("将在 " + autoStopMinutes + " 分钟后: " + actionText);
} else {
    toastLog("脚本将无限期运行。");
}


// --- 4. 悬浮窗 (提前创建) ---
var window = floaty.window(
    <frame>
        <vertical bg="#88000000" padding="10">
            <text id="title" text="自动滑动脚本 (可拖动)" textColor="#FFFFFF" textSize="16sp" />
            <vertical bg="#55000000" padding="5dp" margin="5dp 0">
                <text id="runtimeInfo" text="运行: 00:00:00" textColor="#FFD700" textSize="12sp" />
                <text id="screenInfo" text="屏幕: ..." textColor="#CCFFCC" textSize="12sp" />
                <text id="coordInfo" text="坐标: ..." textColor="#CCFFCC" textSize="12sp" />
                <text id="durationInfo" text="时长: ..." textColor="#CCFFCC" textSize="12sp" />
            </vertical>
            <text text="---- 实时日志 (自动滚动) ----" textColor="#FFFF99" textSize="10sp" />
            <scroll id="logScrollView" h="100dp" w="250dp">
                <text id="logText" text="日志将显示在这里..." textColor="#FFFFFF" textSize="12sp" />
            </scroll>
            <horizontal marginTop="5dp">
                {/* 按钮文本默认为"暂停", 但我们会在启动时修改它 */}
                <button id="pauseButton" text="暂停" w="auto" /> 
                <button id="stopButton" text="停止脚本" w="auto" style="Widget.AppCompat.Button.Colored" margin="0 0 0 10dp" />
            </horizontal>
        </vertical>
    </frame>
);

window.exitOnClose();
window.setPosition(50, 50);

// 4d. 立即设置静态信息
var screenWidth = device.width;
var screenHeight = device.height;
var startX = screenWidth / 2;
var startY = screenHeight * 0.75;
var endX = screenWidth / 2;
var endY = screenHeight * 0.25;
var swipeDuration = 300;

ui.run(function() {
    window.screenInfo.setText("屏幕: " + screenWidth + "x" + screenHeight);
    window.coordInfo.setText("坐标: (" + startX + ", " + startY.toFixed(0) + ") -> (" + endX + ", " + endY.toFixed(0) + ")");
    window.durationInfo.setText("时长: " + swipeDuration + "ms");
});


// --- 5. 启动子线程 (滑动任务) ---
// (注意：isPaused 此时为 true, 所以线程启动后会立刻暂停)
var mainThread = threads.start(function() {
    try {
        var swipeCount = 0;
        while (true) {
            // 检查暂停 (脚本启动时会卡在这里, 直到监视器解除暂停)
            if (isPaused) {
                sleep(1000); 
                continue;    
            }
            
            // --- 只有 isPaused 变为 false 后, 才会执行以下代码 ---
            
            // 1. 滑动
            swipe(startX, startY, endX, endY, swipeDuration);
            swipeCount++; 
            logToWindow("第 " + swipeCount + " 次滑动已执行");

            // 2. 延迟
            var delayTime = random(minDelay, maxDelay);
            var delayInSec = Math.round(delayTime / 1000); 
            if (delayInSec <= 0) { delayInSec = 1; }
            logToWindow("随机等待: " + delayInSec + " 秒");

            // 3. 倒计时
            for (var i = delayInSec; i > 0; i--) {
                if (isPaused) {
                    i++; 
                    sleep(1000);
                    continue; 
                }
                logToWindow("... " + i + " 秒后滑动 ...");
                sleep(1000); 
                
                // 5c. 倒计时中检查自动停止
                if (autoStopMillis > 0) {
                    var currentTime = new Date().getTime();
                    if ((currentTime - startTime) >= autoStopMillis) {
                        if (onTimerEndAction === 0) {
                            logToWindow("时间到：正在返回桌面并停止...");
                            home(); 
                            logToWindow("已执行返回桌面操作");
                            ui.run(function() { window.close(); });
                            mainThread.interrupt(); 
                            return; 
                        } else if (onTimerEndAction === 1) {
                            logToWindow("时间到：正在暂停播放并暂停脚本...");
                            var centerX = screenWidth / 2;
                            var centerY = screenHeight / 2;
                            press(centerX, centerY, 50);
                            logToWindow("已执行: 暂停");
                            isPaused = true; 
                            autoStopMillis = 0; 
                            ui.run(function() {
                                window.pauseButton.setText("继续");
                            });
                        }
                    }
                }
            }
        }
    } catch (e) {
        logToWindow("脚本已被用户停止。");
        console.error("脚本停止: ", e);
    }
});

// --- 6. 按钮监听 (主线程) ---
window.stopButton.click(function() {
    logToWindow("正在手动停止...");
    mainThread.interrupt();
    window.close();
});

// (暂停按钮的逻辑不变, 它可以正常暂停/恢复)
window.pauseButton.click(function() {
    isPaused = !isPaused; 
    var buttonText = isPaused ? "继续" : "暂停";
    var logText = isPaused ? "脚本已暂停" : "脚本已恢复";
    
    ui.run(function() {
        window.pauseButton.setText(buttonText);
    });
    
    logToWindow(logText);
});


// --- 7. 运行时长更新 (主线程) ---
setInterval(() => {
    var elapsedMs = new Date().getTime() - startTime;
    var formattedTime = formatMillis(elapsedMs);
    
    ui.run(() => {
        if (typeof window !== 'undefined' && window.runtimeInfo) {
            window.runtimeInfo.setText("运行: " + formattedTime);
        }
    });
    
}, 1000); 


// --- 8. 新增：应用启动与监视器 (在主线程执行) ---

// 8a. 设置初始状态 (禁用按钮并提示)
ui.run(function() {
    window.pauseButton.setText("启动中...");
    window.pauseButton.setEnabled(false); // 暂时禁用暂停按钮
});
logToWindow("目标应用包名: " + douyinPackage);
if (hasClonedApps) {
    logToWindow("双开模式：请在弹窗中选择应用...");
} else {
    logToWindow("正在启动应用...");
}

// 8b. 启动应用
if (!app.launch(douyinPackage)) {
    logToWindow("启动应用失败！请手动启动。");
    // (如果启动失败，监视器也会等待您手动启动)
}

// 8c. 启动监视器线程 (用于自动开始)
threads.start(function() {
    var appDetected = false;
    while (!appDetected) {
        sleep(1000); // 每秒检查一次
        var currentApp = currentPackage(); // 获取当前前台包名
        
        if (currentApp === douyinPackage) {
            appDetected = true; // 找到了！
            logToWindow("检测到应用已在前台！");
            logToWindow("... 3 秒后自动开始 ...");
            sleep(3000); // 额外等待3秒，确保页面加载

            // 解除暂停
            isPaused = false; 
            
            // 恢复按钮
            ui.run(function() {
                window.pauseButton.setText("暂停");
                window.pauseButton.setEnabled(true); // 恢复按钮点击
            });
            
            // 记录启动日志
            logToWindow("脚本启动：随机 " + minSec + " 到 " + maxSec + " 秒");
            if (autoStopMinutes > 0) {
                var actionText = (onTimerEndAction === 0) ? "返回桌面并停止" : "暂停播放并暂停脚本";
                logToWindow("将在 " + autoStopMinutes + " 分钟后: " + actionText);
            }
        } else {
            // (可选) 调试日志，如果需要可以取消注释
            // console.log("等待应用启动... (当前: " + currentApp + ")");
        }
    }
    // (监视器线程在此结束)
});
// --- 0. 权限检查 ---
auto.waitFor(); // 检查无障碍服务
// !!! 请在运行前，手动为 Auto.js 开启“悬浮窗权限” !!!

// --- 1. 全局变量定义 (全部提前) ---
var logHistory = []; 
var MAX_LOG_LINES = 50; 
// var startTime = new Date().getTime(); // <--- 旧逻辑：删除
var totalActiveTime = 0; // <--- 新逻辑：记录总有效运行时间 (毫秒)
var isPaused = true; // 默认暂停
var onTimerEndAction = 0; 
var douyinPackage = ""; 

// --- 2. 辅助函数定义 ---

function logToWindow(msg) {
    if (typeof window === 'undefined' || window === null) return;
    ui.run(function() {
        var time = new Date().toLocaleTimeString(); 
        var logMsg = time + ": " + msg;
        logHistory.push(logMsg); 
        if (logHistory.length > MAX_LOG_LINES) { logHistory.shift(); }
        window.logText.setText(logHistory.join("\n"));
        ui.post(function() {
            try {
                var textHeight = window.logText.getHeight();
                window.logScrollView.scrollTo(0, textHeight);
            } catch (e) {}
        }, 200); 
    });
}

function formatMillis(ms) {
    var seconds = Math.floor((ms / 1000) % 60);
    var minutes = Math.floor((ms / (1000 * 60)) % 60);
    var hours = Math.floor(ms / (1000 * 60 * 60)); 
    seconds = (seconds < 10 ? '0' : '') + seconds;
    minutes = (minutes < 10 ? '0' : '') + minutes;
    hours = (hours < 10 ? '0' : '') + hours;
    return hours + ":" + minutes + ":" + seconds;
}

// --- 3. 用户自定义输入 ---

var appIndex = dialogs.select("请选择要运行的应用", "抖音 (普通版)", "抖音极速版");
if (appIndex === -1) { toast("用户取消"); exit(); }
else if (appIndex === 0) { douyinPackage = "com.ss.android.ugc.aweme"; }
else if (appIndex === 1) { douyinPackage = "com.ss.android.ugc.aweme.lite"; }

var hasClonedApps = dialogs.confirm("重要：您是否对所选应用使用了“双开”或“应用分身”功能？");

var minSecInput = dialogs.rawInput("请输入【最小】观看时间（秒）", "5");
var minSec = parseInt(minSecInput); if (isNaN(minSec)) minSec = 5;

var maxSecInput = dialogs.rawInput("请输入【最大】观看时间（秒）", "15");
var maxSec = parseInt(maxSecInput); if (isNaN(maxSec)) maxSec = 15;
if (minSec > maxSec) { var t = minSec; minSec = maxSec; maxSec = t; }
var minDelay = minSec * 1000; var maxDelay = maxSec * 1000;

var autoStopMinutesInput = dialogs.rawInput("请输入【总运行分钟数】（0为不限制）", "0");
var autoStopMinutes = parseInt(autoStopMinutesInput); if (isNaN(autoStopMinutes)) autoStopMinutes = 0;

var autoStopMillis = 0;
if (autoStopMinutes > 0) {
    var actionIndex = dialogs.select("时间到后执行：", "返回桌面并停止", "暂停播放并暂停脚本");
    if (actionIndex === -1) { toast("用户取消"); exit(); }
    onTimerEndAction = actionIndex; 
    autoStopMillis = autoStopMinutes * 60 * 1000;
}

// --- 4. 悬浮窗创建 ---
var window = floaty.window(
    <frame>
        <vertical bg="#88000000" padding="10">
            {/* 标题栏：增加 id="title" 用于绑定拖动事件 */}
            <text id="title" text="自动滑动脚本 (按住我拖动)" textColor="#FFFFFF" textSize="16sp" bg="#44000000" padding="5"/>
            
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
                <button id="pauseButton" text="暂停" w="auto" /> 
                <button id="stopButton" text="停止脚本" w="auto" style="Widget.AppCompat.Button.Colored" margin="0 0 0 10dp" />
            </horizontal>
        </vertical>
    </frame>
);

window.exitOnClose();
window.setPosition(50, 50);

// --- 5. 新增：悬浮窗拖动逻辑 ---
// 绑定在标题栏上
var x = 0, y = 0;
var windowX, windowY;
var downTime = 0;
window.title.setOnTouchListener(function(view, event) {
    switch (event.getAction()) {
        case event.ACTION_DOWN:
            x = event.getRawX();
            y = event.getRawY();
            windowX = window.getX();
            windowY = window.getY();
            downTime = new Date().getTime();
            return true;
        case event.ACTION_MOVE:
            // 计算移动距离
            window.setPosition(windowX + (event.getRawX() - x), windowY + (event.getRawY() - y));
            return true;
        case event.ACTION_UP:
            return true;
    }
    return true;
});


// --- 6. 初始化信息 ---
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

// --- 7. 启动子线程 ---
var mainThread = threads.start(function() {
    try {
        var swipeCount = 0;
        while (true) {
            if (isPaused) {
                sleep(1000); 
                continue;    
            }
            
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
                
                // 检查自动停止 (逻辑修改：使用 totalActiveTime)
                if (autoStopMillis > 0) {
                    // 使用累积的有效时间进行判断
                    if (totalActiveTime >= autoStopMillis) {
                        if (onTimerEndAction === 0) {
                            logToWindow("时间到：返回桌面并停止");
                            home(); 
                            ui.run(function() { window.close(); });
                            mainThread.interrupt(); 
                            return; 
                        } else if (onTimerEndAction === 1) {
                            logToWindow("时间到：暂停播放并暂停");
                            var centerX = screenWidth / 2;
                            var centerY = screenHeight / 2;
                            press(centerX, centerY, 50);
                            
                            isPaused = true; 
                            autoStopMillis = 0; // 防止重复触发
                            ui.run(function() { window.pauseButton.setText("继续"); });
                        }
                    }
                }
            }
        }
    } catch (e) {
        logToWindow("脚本停止: " + e);
    }
});

// --- 8. 按钮监听 ---
window.stopButton.click(function() {
    logToWindow("手动停止");
    mainThread.interrupt();
    window.close();
});

window.pauseButton.click(function() {
    isPaused = !isPaused; 
    var buttonText = isPaused ? "继续" : "暂停";
    ui.run(function() { window.pauseButton.setText(buttonText); });
    logToWindow(isPaused ? "已暂停" : "已恢复");
});

// --- 9. 计时器逻辑 (修复版) ---
var lastTick = new Date().getTime();
setInterval(() => {
    var now = new Date().getTime();
    
    // 只有在非暂停状态下，才增加时间
    if (!isPaused) {
        // 增加上一秒到现在的时间差
        totalActiveTime += (now - lastTick);
    }
    
    // 更新 lastTick 为当前时间，为下一次计算做准备
    lastTick = now;
    
    var formattedTime = formatMillis(totalActiveTime);
    ui.run(() => {
        if (typeof window !== 'undefined' && window.runtimeInfo) {
            window.runtimeInfo.setText("运行: " + formattedTime);
        }
    });
}, 1000);


// --- 10. 自动启动与监视 ---
ui.run(function() {
    window.pauseButton.setText("启动中...");
    window.pauseButton.setEnabled(false);
});

if (hasClonedApps) {
    logToWindow("双开模式：请手动选择应用...");
} else {
    logToWindow("正在启动应用...");
}

if (!app.launch(douyinPackage)) {
    logToWindow("启动失败，请手动启动");
}

threads.start(function() {
    var appDetected = false;
    while (!appDetected) {
        sleep(1000); 
        var currentApp = currentPackage(); 
        if (currentApp === douyinPackage) {
            appDetected = true; 
            logToWindow("检测到应用在前台！3秒后开始...");
            sleep(3000); 

            isPaused = false; // 解除暂停
            
            ui.run(function() {
                window.pauseButton.setText("暂停");
                window.pauseButton.setEnabled(true);
            });
            
            logToWindow("脚本启动：随机 " + minSec + " 到 " + maxSec + " 秒");
            if (autoStopMinutes > 0) {
                logToWindow("将在 " + autoStopMinutes + " 分钟后停止");
            }
        }
    }
});

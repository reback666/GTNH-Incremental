import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './style.css';
import { getCore } from './game/engine';
import { stateSnapshot } from './game/diagnostics';
import { errorText, installCrashCapture, loadPersistedLog, logEvent } from './game/log';

// 日志要在挂载之前就位：启动阶段出的问题同样会被玩家拿来问
loadPersistedLog();
installCrashCapture(window, () => stateSnapshot(getCore()).join('\n'));

const app = createApp(App);
// 界面渲染出错不会冒泡到 window.onerror，得单独接一层
app.config.errorHandler = (error, _instance, info) => {
  logEvent(
    'error',
    'ui.render',
    `界面出错（${info}）`,
    [errorText(error), ...stateSnapshot(getCore())].join('\n'),
  );
};

app.use(createPinia()).mount('#app');

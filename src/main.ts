import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './style.css';
import { voltageCssVariables } from './content/theme';
import { getCore } from './game/engine';
import { crashDetail, diagnosticSnapshot } from './game/diagnostics';
import { installCrashCapture, loadPersistedLog, logEvent } from './game/log';

// 日志要在挂载之前就位：启动阶段出的问题同样会被玩家拿来问
for (const [name, value] of Object.entries(voltageCssVariables())) {
  document.documentElement.style.setProperty(name, value);
}
loadPersistedLog();
installCrashCapture(window, () => diagnosticSnapshot(getCore()).slice(0, 4).join('\n'));

const app = createApp(App);
// 界面渲染出错不会冒泡到 window.onerror，得单独接一层
app.config.errorHandler = (error, _instance, info) => {
  logEvent(
    'error',
    'ui.render',
    `界面出错（${info}）`,
    crashDetail(error, getCore()),
  );
};

app.use(createPinia()).mount('#app');

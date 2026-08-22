// صاري 5.0 - نظام التشغيل المتقدم
// يقوم بتشغيل الواجهة الأمامية للخدمة الثابتة والخلفية للـ API مع إدارة الحالة الكاملة عبر واجهة المستخدم

const { spawn, exec } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');


const config = {
    ports: {
        backend: 3000,
        frontend: 8000
    },
    commands: {
        backend: 'node server.js',
        frontend: 'python -m http.server 8000'
    }
};

class SariSheetsApp {
    constructor() {
        this.processes = {};
        this.ui = this.createUI();
        this.healthCheckInterval = null;
    }

    createUI() {
        return {
            print: (text, type = 'info') => {
                const icons = { success: '✅', info: 'ℹ️', error: '❌', warning: '⚠️', starting: '🚀' };
                const colors = {
                    success: '\x1b[32m',
                    info: '\x1b[36m',
                    error: '\x1b[31m',
                    warning: '\x1b[33m',
                    starting: '\x1b[35m',
                    reset: '\x1b[0m'
                };
                console.log(`${colors[type] || colors.info}${icons[type] || icons.info} ${text}${colors.reset}`);
            },

            clear: () => {
                console.clear();
            },

            title: () => {
                console.log('\n' + '='.repeat(70));
                console.log('🚀 صاري 5.0 - نظام إدارة جوجل شيت');
                console.log('='.repeat(70) + '\n');
            }
        };
    }

    async checkPort(port) {
        return new Promise((resolve) => {
            const server = http.createServer();
            server.listen(port, () => {
                server.close();
                resolve(true);
            });
            server.on('error', () => resolve(false));
        });
    }

    async startBackend() {
        return new Promise((resolve) => {
            const wasRunning = await this.checkPort(config.ports.backend);
            if (wasRunning) {
                this.ui.print('الخادم الخلفي مشغّل بالفعل على المنفذ 3000', 'info');
                return resolve(true);
            }

            this.ui.print('جاري تشغيل الخادم الخلفي (Node.js)...', 'starting');
            this.processes.backend = spawn(config.commands.backend, {
                stdio: 'pipe',
                detached: true
            });

            this.processes.backend.stdout?.on('data', (data) => {
                const line = data.toString().trim();
                if (line.includes('🟢')) {
                    this.ui.print('الخادم الخلفي يعمل: http://localhost:3000', 'success');
                    resolve(true);
                } else if (line.includes('🔑 المصادقة:')) {
                    const service = line.match(/الخدمة:\s+([^\s]+)/)?.[1] || 'خدمة الحساب الخاصة';
                    this.ui.print(`متصل بـ Google Sheets مع: ${service}`, 'info');
                } else if (line.includes('🌐 الخادم يعمل على:')) {
                    const match = line.match(/الخادم يعمل على:\s+(http:\/\/localhost:\d+)/);
                    if (match) {
                        this.ui.print(`API متاح: ${match[1]}`, 'success');
                    }
                } else if (line.includes('✅ المصادقة ناجحة')) {
                    this.ui.print('تم التحقق من مصادقة Google Sheets API بنجاح', 'success');
                } else if (!line.includes('جاري التحقق') && !line.includes('🟡')) {
                    this.ui.print(line, 'info');
                }
            });

            this.processes.backend.stderr?.on('data', (data) => {
                const line = data.toString();
                if (!line.includes('pile') && !line.includes('maxListeners')) {
                    this.ui.print(`خادم الخلفية: ${line}`, 'error');
                }
            });

            this.processes.backend.on('close', (code) => {
                if (code !== 0) {
                    this.ui.print(`انتهى الخادم الخلفي مع الكود ${code}`, 'error');
                }
            });

            setTimeout(() => {
                if (!this.processes.backend) {
                    this.ui.print('❌ فشل بدء تشغيل الخادم الخلفي (ربما couldn't bind إلى المنفذ)', 'error');
                    resolve(false);
                }
            }, 5000);
        });
    }

    async startFrontend() {
        return new Promise((resolve) => {
            const wasRunning = await this.checkPort(config.ports.frontend);
            if (wasRunning) {
                this.ui.print('الخادم الأمامي مشغّل بالفعل على المنفذ 8000', 'info');
                return resolve(true);
            }

            this.ui.print('جاري تشغيل الخادم الأمامي (الخدمة الثابتة)...', 'starting');
            this.processes.frontend = spawn(config.commands.frontend, {
                stdio: 'pipe',
                detached: true,
                cwd: path.dirname(__filename)
            });

            this.processes.frontend.stdout?.on('data', (data) => {
                const line = data.toString().trim();
                if (line.includes('Serving HTTP on')) {
                    this.ui.print('الخادم الأمامي يعمل: http://localhost:8000', 'success');
                    this.ui.print('🎯 طريقة الوصول (الموصى بها): http://localhost:8000/index.html', 'info');
                    resolve(true);
                } else if (line.includes('http.server.py running')) {
                    this.ui.print('خادم خدمة ثابتة يعمل على http://localhost:8000', 'success');
                    resolve(true);
                } else if (line.includes('ImportError') && line.includes('python3')) {
                    this.ui.print('⚠️ خطأ: Python غير مثبت أو غير متاح', 'error');
                    this.ui.print('   قم بتنزيل Python من: https://www.python.org/downloads/', 'info');
                    resolve(false);
                } else if (line.includes('cannot ensure that python3')) {
                    this.ui.print('⚠️ خطأ: لا يمكن تشغيل Python (ربما تحتاج إلى sudo؟)', 'error');
                    resolve(false);
                } else if (!line.includes('pickle') && !line.includes('Serving')) {
                    this.ui.print(`الخادم الأمامي: ${line}`, 'info');
                }
            });

            this.processes.frontend.stderr?.on('data', (data) => {
                const line = data.toString().trim();
                if (line.includes('ImportError') && line.includes('python3')) {
                    this.ui.print('⚠️ خطأ: لا يمكن تشغيل Python (التثبيت المطلوب)', 'error');
                    this.ui.print('   قم بتنزيل Python من: https://www.python.org/downloads/', 'info');
                } else if (!line.includes('pickle') && line.length > 0) {
                    if (!line.startsWith('http://')) {
                        this.ui.print(`حشو الخادم الأمامي: ${line}`, 'error');
                    }
                }
            });

            this.processes.frontend.on('close', (code) => {
                if (code !== 0) {
                    this.ui.print(`انتهى الخادم الأمامي مع الكود ${code}`, 'error');
                }
            });

            setTimeout(() => {
                if (!this.processes.frontend) {
                    this.ui.print('❌ فشل بدء تشغيل الخادم الأمامي (ربما لا يوجد python.exe)', 'error');
                    resolve(false);
                }
            }, 5000);
        });
    }

    async checkServiceStatus() {
        const results = {};

        this.ui.print('التحقق من حالة الخدمات...', 'info');

        results.frontend = await this.checkPort(config.ports.frontend);
        if (results.frontend) {
            this.ui.print('✅ الخادم الأمامي يعمل', 'success');
        } else {
            this.ui.print('❌ تم إيقاف الخادم الأمامي', 'error');
        }

        results.backend = await this.checkPort(config.ports.backend);
        if (results.backend) {
            this.ui.print('✅ الخادم الخلفي يعمل', 'success');
        } else {
            this.ui.print('❌ تم إيقاف الخادم الخلفي', 'error');
        }

        return results;
    }

    printHelp() {
        this.ui.clear();
        this.ui.title();
        console.log('📖 الخيارات المتاحة:');
        console.log('\n  start (الافتراضي)');
        console.log('    → يبدأ الخادم الأمامي (الخدمة الثابتة) + الخادم الخلفي (Node.js)');
        console.log('    → يفتح متصفحًا تلقائيًا إذا نجحت الخدمات');
        console.log('    → يوفر واجهة مستخدم للتحقق من الحالة');

        console.log('\n  dev');
        console.log('    → فقط الخادم الخلفي (Node.js) - محتوى التطبيق في المتصفح');

        console.log('\n  frontend');
        console.log('    → فقط الخادم الأمامي (الخدمة الثابتة) - للتحقق من الحالة والواجهة الأمامية');

        console.log('\n  status');
        console.log('    → التحقق مما إذا كانت الخدمات تعمل');

        console.log('\n  stop');
        console.log('    → إيقاف كلا الخدمتين');

        console.log('\n  logs');
        console.log('    → عرض السجلات الحية');

        console.log('\n  serve');
        console.log('    → بدء تشغيل خدمة ثابتة تخدم فقط فهرس المشروع الرئيسي (لـ Render/Netlify)');

        console.log('\n  api-only');
        console.log('    → بدء تشغيل الخادم الخلفي فقط (لواجهات برمجة التطبيقات السحابية)');

        console.log('\n🔥 ملاحظات مهمة:');
        console.log('  • كل تطبيق يعمل في نافذة منفصلة (معالج بحقوق Windows)');
        console.log('  • النقر على أي نافذة يركزها في الخلفية');
        console.log('  • سيعرض الخادم الأمامي في الوضع العادي صفحة التحقق (هذا العرض)');
        console.log('  • بعد التشغيل الناجح، انقر على \"بدء التطبيق\" لفتح التطبيق الكامل');
        console.log('  • لا حاجة لـ run.bat - طريقة التشغيل الأصلية هي الطرفية/المشغل');
    }

    async startAll() {
        this.ui.clear();
        this.ui.title();
        this.ui.print('جاري بدء خدمات صاري 5.0...', 'starting');

        const frontendStart = new Promise((resolve) => {
            setTimeout(() => resolve(true), 1000);
        });

        const frontendSuccess = await this.startFrontend();
        if (!frontendSuccess) {
            this.ui.print('⚠️ فشل بدء تشغيل الخادم الأمامي - جارٍ التخطي', 'warning');
        }

        if (frontendSuccess) {
            await new Promise(resolve => setTimeout(resolve, 2500));
        }

        const backendSuccess = await this.startBackend();

        if (frontendSuccess && backendSuccess) {
            this.ui.print('\n✅ بدأت الخدمات بنجاح!', 'success');
            this.ui.print('\n🔗 روابط الوصول:', 'info');
            this.ui.print('   الخادم الأمامي (الخدمة الثابتة): http://localhost:8000/index.html', 'info');
            this.ui.print('   الخادم الخلفي (معرف سحابي):   http://localhost:3000', 'info');

            this.ui.print('\n📝 ملاحظات:', 'info');
            this.ui.print('   • يوفر الخادم الأمامي الأفضلية: واجهة مستخدم للتحقق من الحالة + خدمة ثابتة', 'info');
            this.ui.print('   • ابدأ http://localhost:8000 ثم انقر على \"بدء التطبيق\" للدخول', 'info');
            this.ui.print('   • يوفر الخادم الخلفي واجهة برمجة التطبيقات: /api/sheets, /api/data, إلخ', 'info');
            this.ui.print('   • انقر الشعار على http://localhost:8000 لفتح GitHub', 'info');

            this.ui.print('\n🎮 للسيطرة على الخدمات:', 'info');
            this.ui.print('   • نافذة الخادم الأمامي (Python) - ملفات الخدمة الثابتة', 'info');
            this.ui.print('   • نافذة الخادم الخلفي (Node.js) - صفحات واجهة برمجة التطبيقات الخلفية', 'info');

            if (process.platform === 'win32') {
                this.ui.print('\n💡 نصيحة لويندوز:', 'info');
                this.ui.print('   • أغلق أي نافذة تارجت بالنقر على \"X\" (Windows) لتحديد نافذة طرفية جديدة.', 'info');
                this.ui.print('   • لتثبيت الخدمات في الخلفية، استخدمنا detached:true', 'info');
            }

            this.savePIDs();
            this.startHealthCheckUI();

            this.ui.print('\\n💡 انتظر لحظة... فتح المتصفح تلقائياً', 'info');
            await new Promise(resolve => setTimeout(resolve, 1500));

            try {
                const cmd = process.platform === 'win32' ? 'start' : 'xdg-open';
                spawn(cmd, ['http://localhost:8000/index.html'], { detached: true, stdio: 'ignore' });
                this.ui.print('✨ تم فتح التطبيق في المتصفح!', 'success');
            } catch (e) {
                this.ui.print('⚠️ لم نتمكن من فتح المتصفح تلقائياً', 'warning');
                this.ui.print('   افتح يدوياً: http://localhost:8000/index.html', 'info');
            }
        } else {
            this.ui.print('\n❌ فشل بدء إحدى الخدمات. راجع الأخطاء أعلاه.', 'error');
            this.stopAll();
        }
    }

    async startHealthCheckUI() {
        const checkUI = async () => {
            try {
                const [frontendStatus, backendStatus] = await Promise.allSettled([
                    fetch('http://localhost:8000/', { method: 'HEAD' }),
                    fetch('http://localhost:3000/api/sheets', { method: 'HEAD' })
                ]);

                const frontendOk = frontendStatus.status === 'fulfilled' && frontendStatus.value.ok;
                const backendOk = backendStatus.status === 'fulfilled' && backendStatus.value.ok;

                if (frontendOk && backendOk) {
                    console.log('\n' + '='.repeat(70));
                    console.log('🔄 تحقق مباشر:', '✅ كل شيء يعمل بشكل مثالي');
                    console.log('   الخادم الأمامي:', 'http://localhost:8000/index.html');
                    console.log('   الخادم الخلفي:', 'http://localhost:3000');
                    console.log('='.repeat(70));
                }
            } catch (error) {
                this.ui.print('⚠️ فشل فحص الصحة المباشرة', 'warning');
            }
        };

        this.healthCheckInterval = setInterval(checkUI, 20000);
        await checkUI();
    }

    stopAll() {
        this.ui.print('جارٍ إيقاف الخدمات...', 'starting');

        if (this.processes.backend) {
            this.ui.print('إيقاف الخادم الخلفي...', 'info');
            this.processes.backend.kill('SIGINT');
            this.ui.print('✅ تم إيقاف الخادم الخلفي', 'success');
        }

        if (this.processes.frontend) {
            this.ui.print('إيقاف الخادم الأمامي...', 'info');
            this.processes.frontend.kill('SIGINT');
            this.ui.print('✅ تم إيقاف الخادم الأمامي', 'success');
        }

        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }

        if (fs.existsSync('./pids.json')) {
            fs.unlinkSync('./pids.json');
        }

        this.processes = {};
    }

    async checkAllAndStart() {
        const status = await this.checkServiceStatus();
        const [frontendRunning, backendRunning] = [status.frontend, status.backend];

        if (frontendRunning && backendRunning) {
            this.ui.print('\n✅ كلا الخدمتين تعملان بالفعل', 'success');
            this.ui.print('   (لا حاجة إلى التشغيل)', 'info');
        } else {
            if (frontendRunning && !backendRunning) {
                this.ui.print('\n⚠️ يوجد خادم أمامي يعمل فقط. جارٍ بدء الخادم الخلفي.', 'warning');
                await this.startBackend();
            } else if (!frontendRunning && backendRunning) {
                this.ui.print('\n⚠️ يوجد خادم خلفي يعمل فقط. جارٍ بدء الخادم الأمامي.', 'warning');
                await this.startFrontend();
            } else {
                await this.startAll();
            }
        }
    }

    savePIDs() {
        const data = {
            backend: this.processes.backend?.pid,
            frontend: this.processes.frontend?.pid
        };
        fs.writeFileSync('./pids.json', JSON.stringify(data, null, 2));
    }

    async runCommand(args) {
        if (!args || args.length === 0) {
            this.printHelp();
            return;
        }

        args = args.map(arg => arg.toLowerCase());

        const commands = {
            start: async () => this.startAll(),
            dev: async () => {
                this.ui.clear();
                this.ui.title();
                this.ui.print('بدء تشغيل الخادم الخلفي فقط (في المتصفح مع JWT)', 'starting');
                await this.startBackend();
            },
            frontend: async () => {
                this.ui.clear();
                this.ui.title();
                this.ui.print('بدء تشغيل الخادم الأمامي فقط (الخدمة الثابتة)', 'starting');
                await this.startFrontend();
            },
            status: async () => {
                this.ui.clear();
                this.ui.title();
                const status = await this.checkServiceStatus();
                this.ui.print('\n📊 الحالة:');
                this.ui.print(`   الخادم الأمامي     ${status.frontend ? '✅ يعمل' : '❌ متوقف'}`, status.frontend ? 'success' : 'error');
                this.ui.print(`   الخادم الخلفي     ${status.backend ? '✅ يعمل' : '❌ متوقف'}`, status.backend ? 'success' : 'error');
                this.ui.print('\n💡 روابط الوصول:');
                this.ui.print('   الخادم الأمامي: http://localhost:8000/index.html (الوضع العادي)');
                this.ui.print('   الخادم الخلفي: http://localhost:3000 (واجهات برمجة التطبيقات)');
            },
            stop: async () => this.stopAll(),
            restart: async () => {
                this.ui.clear();
                this.ui.title();
                await this.stopAll();
                await new Promise(resolve => setTimeout(resolve, 2000));
                await this.startAll();
            },
            logs: async () => {
                this.ui.print('عرض السجلات الحية (Ctrl+C لإيقاف)', 'info');
                const logFile = './server.log';
                if (!fs.existsSync(logFile)) {
                    this.ui.print('❌ ملف السجل غير موجود', 'error');
                    return;
                }

                try {
                    const { spawn } = require('child_process');
                    const proc = spawn('more', [logFile]);
                    proc.stdout.pipe(process.stdout);
                } catch (e) {
                    this.ui.print('❌ لا يمكن عرض السجلات', 'error');
                }
            },
            serve: async () => {
                this.ui.clear();
                this.ui.title();
                this.ui.print('بدء تشغيل خدمة ثابتة تخدم نقطة الدخول الرئيسية فقط...', 'starting');

                const express = require('express');
                const path = require('path');
                const app = express();

                app.use(express.static(__dirname));

                app.get('*', (req, res) => {
                    res.sendFile(path.join(__dirname, 'index.html'));
                });

                const server = app.listen(3000, () => {
                    this.ui.print('✅ تم بدء تشغيل خدمة ثابتة على http://localhost:3000', 'success');
                    this.ui.print('   خدمة نقطة الدخول: http://localhost:3000 (يقوم بتشغيل الاتصال بـ GitHub)', 'info');
                });

                this.ui.print('\n💡 الوصول:', 'info');
                this.ui.print('   الخادم الأساسي: http://localhost:3000 (واجهة مستخدم للتحقق من الحالة)', 'info');
                this.ui.print('   الصفحة التالية: http://localhost:3000/index.html (التطبيق الكامل)', 'info');

                this.ui.print('\n💡 للتطوير:', 'info');
                this.ui.print('   → قم بتشغيل: npm run start', 'info');
                this.ui.print('   → لعرض كلا الخدمتين (الخادم الأمامي + الخادم الخلفي)', 'info');
            },
            api: async () => {
                this.ui.clear();
                this.ui.title();
                this.ui.print('بدء تشغيل الخادم الخلفي فقط (واجهات برمجة التطبيقات السحابية)', 'starting');
                this.ui.print('   ⚠️ للخدمة الثابتة (Web), قم بتشغيل: npm run serve', 'info');
                await this.startBackend();
            },
            api-only: async () => {
                this.ui.clear();
                this.ui.title();
                this.ui.print('بدء تشغيل الخادم الخلفي فقط (واجهات برمجة التطبيقات السحابية)', 'starting');
                this.ui.print('   ⚠️ للخدمة الثابتة (Web), قم بتشغيل: npm run serve', 'info');
                await this.startBackend();
            }
        };

        if (commands[args[0]]) {
            await commands[args[0]]();
        } else {
            this.ui.print(`❌ الأمر غير معروف: ${args[0]}`, 'error');
            this.printHelp();
        }
    }
}

async function main() {
    const app = new SariSheetsApp();

    if (require.main === module) {
        const args = process.argv.slice(2);
        if (args[0] === 'start' || args.length === 0) {
            await app.runCommand(['start']);
        } else {
            await app.runCommand(args);
        }
    }
}

if (require.main === module) {
    main().catch(err => {
        console.error('❌ خطأ حرج:', err);
        process.exit(1);
    });
}

module.exports = { SariSheetsApp };

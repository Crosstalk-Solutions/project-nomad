/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/
import DocsController from '#controllers/docs_controller'
import HomeController from '#controllers/home_controller'
import SettingsController from '#controllers/settings_controller'
import SystemController from '#controllers/system_controller'
import router from '@adonisjs/core/services/router'
import transmit from '@adonisjs/transmit/services/main'

transmit.registerRoutes();

router.get('/', [HomeController, 'index']);
router.get('/home', [HomeController, 'home']);
router.on('/about').renderInertia('about')

router.group(() => {
    router.get('/system', [SettingsController, 'system'])
    router.get('/apps', [SettingsController, 'apps'])
}).prefix('/settings')

router.group(() => {
    router.get('/:slug', [DocsController, 'show'])
    router.get('/', ({ inertia }) => {
        return inertia.render('Docs/Index', {
            title: "Documentation",
            content: "Welcome to the documentation!"
        });
    });
}).prefix('/docs')

router.group(() => {
    router.get('/list', [DocsController, 'list'])
}).prefix('/api/docs')

router.group(() => {
    router.get('/services', [SystemController, 'getServices'])
    router.post('/services/install', [SystemController, 'installService'])
    router.post('/simulate-sse', [SystemController, 'simulateSSE'])
}).prefix('/api/system')
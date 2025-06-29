/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/
import HomeController from '#controllers/home_controller'
import SystemController from '#controllers/system_controller'
import router from '@adonisjs/core/services/router'
import transmit from '@adonisjs/transmit/services/main'

transmit.registerRoutes()

router.get('/home', [HomeController, 'index']);
router.on('/about').renderInertia('about')
router.on('/settings').renderInertia('settings')


router.group(() => {
    router.get('/services', [SystemController, 'getServices'])
    router.post('/install-service', [SystemController, 'installService'])
}).prefix('/api/system')
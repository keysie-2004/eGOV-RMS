const db = require('../config/db');
const QRCode = require('qrcode');

class MainController {
    static viewAccounting(req, res) {
        res.render('accounting');
    }

    static viewAddUser(req, res) {
        res.render('add_user');
    }

    static viewArrivals(req, res) {
        res.render('arrivals');
    }

    static viewEditUser(req, res) {
        res.render('edit_user');
    }

    static viewIcsHome(req, res) {
        res.render('ics');
    }

    static viewParHome(req, res) {
        res.render('par');
    }

    static viewUserList(req, res) {
        res.render('user_list');
    }

    // ICS 2023 Controller
    static viewICS2023(req, res) {
        IcsModel.getIcsRequests((err, requests) => {
            if (err) {
                return res.status(500).send('Error retrieving ICS 2023 requests');
            }
            res.render('ics_2023', { requests });
        });
    }

    // ICS 2024 Controller
    static viewICS2024(req, res) {
        ICS2024Model.getIcsRequests((err, requests) => {
            if (err) {
                return res.status(500).send('Error retrieving ICS 2024 requests');
            }
            res.render('ics_2024', { requests });
        });
    }

    // PAR Vehicles Controller
    static viewPARVehicles(req, res) {
        ParPropertyVehiclesModel.getVehicles((err, vehicles) => {
            if (err) {
                return res.status(500).send('Error retrieving PAR vehicles');
            }
            res.render('par_propertyvehicles', { vehicles });
        });
    }

    // ✅ Analytics View
    static viewAnalytics(req, res) {
        res.render('dist-modern/analytics');
    }
}

module.exports = MainController;

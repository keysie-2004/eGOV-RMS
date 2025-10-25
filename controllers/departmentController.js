const Department = require('../models/departmentModel');

exports.createDepartment = (req, res) => {
    const newDepartment = {
        department_code: req.body.department_code,
        department_name: req.body.department_name,
        department_head: req.body.department_head,
        position: req.body.position,
        contact_person: req.body.contact_person,
        contact_number: req.body.contact_number
    };
    Department.create(newDepartment, (err, result) => {
        if (err) {
            return res.render('add-department', {  user: req.user, error: err.message });
        }
        res.redirect('/departments');
    });
};

exports.getDepartments = (req, res) => {
    Department.getAll((err, departments) => {
        if (err) {
            return res.status(500).send(err);
        }
        res.render('departments', {  user: req.user, departments });
    });
};

exports.getDepartmentById = (req, res) => {
    Department.getById(req.params.id, (err, department) => {
        if (err) {
            return res.status(500).send(err);
        }
        res.render('edit-department', {  user: req.user, department });
    });
};

exports.updateDepartment = (req, res) => {
    const updatedDepartment = {
        department_code: req.body.department_code,
        department_name: req.body.department_name,
        department_head: req.body.department_head,
        position: req.body.position,
        contact_person: req.body.contact_person,
        contact_number: req.body.contact_number
    };
    Department.update(req.params.id, updatedDepartment, (err) => {
        if (err) {
            return res.status(500).send(err);
        }
        res.redirect('/departments');
    });
};

exports.deleteDepartment = (req, res) => {
    const departmentId = req.body.department_id;  // Get from form body
    Department.delete(departmentId, (err) => {
        if (err) {
            return res.status(500).send(err);
        }
        res.redirect('/departments');
    });
};

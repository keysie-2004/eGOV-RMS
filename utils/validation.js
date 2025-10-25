const passwordValidator = (password) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChars = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (password.length < minLength) {
        return { valid: false, message: 'Password must be at least 8 characters long.' };
    }
    if (!hasUpperCase) {
        return { valid: false, message: 'Password must contain at least one uppercase letter.' };
    }
    if (!hasLowerCase) {
        return { valid: false, message: 'Password must contain at least one lowercase letter.' };
    }
    if (!hasNumbers) {
        return { valid: false, message: 'Password must contain at least one number.' };
    }
    if (!hasSpecialChars) {
        return { valid: false, message: 'Password must contain at least one special character.' };
    }
    return { valid: true, message: 'Password is valid.' };
};

const validateSignup = ({ employee_name, email, user_type, password }) => {
    if (!employee_name || employee_name.length < 3) {
        return { valid: false, message: "Employee name must be at least 3 characters long." };
    }
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
        return { valid: false, message: "Invalid email format." };
    }

    return passwordValidator(password);
};

module.exports = { passwordValidator, validateSignup };

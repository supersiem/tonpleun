import startServer from "../../server";

const customConfig = {
    CLIENT_ALLOWED_CHECK: (key: any): number => {
        if (key === 'full-access-key') {
            return 7; // Full access
        } else if (key === 'service-access-key') {
            return 2; // Service access only
        } else if (key === 'config-access-key') {
            return 3; // Config access only
        } else {
            return 0; // No access
        }
    },
    PRIVLEGE_CHECK_AT: 2, // Enforce privilege checks at level 2 and above
    ALLOW_CONFIG_GENERATION: false,
    ALLOW_SCANNING: false,
};

startServer(customConfig);
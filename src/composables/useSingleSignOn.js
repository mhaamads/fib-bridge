// composables/useSingleSignOn.ts

const useSingleSignOn = (clientId, clientSecret, env) => {
  const baseUrl = `https://cors-anywhere.herokuapp.com/https://fib-${env}.fib.iq`;

  const getBasicAuthHeader = () => {
    const token = btoa(`${clientId}:${clientSecret}`);
    return `Basic ${token}`;
  };

  const getHeaders = () => ({
    'Authorization': getBasicAuthHeader(),
    'X-Application-Type': '3rd-party',
    'X-Application-Platform': 'node',
  });

  const initiate = async (signal) => {
    const url = `${baseUrl}/external/v1/sso`;
    const res = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      signal,
    });
    return res.json(); // or res.text(), or handle errors
  };

  const getUserDetails = async (ssoCode, signal) => {
    const url = `${baseUrl}/external/v1/sso/${ssoCode}/details`;
    const res = await fetch(url, {
      method: 'GET',
      headers: getHeaders(),
      signal,
    });
    return res.json();
  };

  return {
    initiate,
    getUserDetails,
  };
};

export default useSingleSignOn;

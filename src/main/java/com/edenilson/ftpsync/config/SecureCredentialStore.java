package com.edenilson.ftpsync.config;

import com.github.javakeyring.BackendNotSupportedException;
import com.github.javakeyring.Keyring;
import com.github.javakeyring.PasswordAccessException;

import java.io.IOException;
import java.util.Optional;

public final class SecureCredentialStore {

    private static final String SERVICE = "ftp-file-synchronizer";
    private static final String ACCOUNT = "default-ftp-password";

    public void save(String password) throws IOException {
        try (Keyring keyring = Keyring.create()) {
            keyring.setPassword(SERVICE, ACCOUNT, password);
        } catch (BackendNotSupportedException | PasswordAccessException exception) {
            throw new IOException("Cofre de credenciais indisponível: " + exception.getMessage(), exception);
        } catch (Exception exception) {
            throw new IOException("Não foi possível fechar o cofre de credenciais.", exception);
        }
    }

    public Optional<String> load() throws IOException {
        try (Keyring keyring = Keyring.create()) {
            return Optional.ofNullable(keyring.getPassword(SERVICE, ACCOUNT));
        } catch (PasswordAccessException exception) {
            return Optional.empty();
        } catch (BackendNotSupportedException exception) {
            throw new IOException("Cofre de credenciais indisponível: " + exception.getMessage(), exception);
        } catch (Exception exception) {
            throw new IOException("Não foi possível fechar o cofre de credenciais.", exception);
        }
    }
}
